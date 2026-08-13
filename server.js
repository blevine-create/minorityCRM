const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const defaultState = {
  leads: [],
  jobs: [],
  estimates: [],
  customers: [],
  auditLog: []
};

function getOverview(state) {
  const totalLeads = state.leads.length;
  const totalJobsValue = state.jobs.reduce((sum, job) => sum + Number(job.value || 0), 0);
  const bookedJobs = state.jobs.length;
  const followUpsDue = state.leads.filter((lead) => !['closed', 'completed'].includes((lead.status || '').toLowerCase())).length;

  return {
    totalLeads,
    bookedJobs,
    revenueThisMonth: totalJobsValue,
    followUpsDue,
    avgJobValue: bookedJobs ? Math.round(totalJobsValue / bookedJobs) : 0,
    winRate: totalLeads ? Math.round((bookedJobs / totalLeads) * 100) : 0
  };
}

function isWithinDateRange(record, from, to) {
  if (!from && !to) return true;
  const recordDate = new Date(record.createdAt || 0);
  if (Number.isNaN(recordDate.getTime())) return false;

  if (from && recordDate < new Date(`${from}T00:00:00`)) return false;
  if (to && recordDate > new Date(`${to}T23:59:59.999`)) return false;
  return true;
}

function getReport(state, from, to) {
  const leads = state.leads.filter((lead) => isWithinDateRange(lead, from, to));
  const jobs = state.jobs.filter((job) => isWithinDateRange(job, from, to));
  const estimates = state.estimates.filter((estimate) => isWithinDateRange(estimate, from, to));
  const customers = state.customers.filter((customer) => isWithinDateRange(customer, from, to));
  const jobRevenue = jobs.reduce((sum, job) => sum + Number(job.value || 0), 0);
  const estimateValue = estimates.reduce((sum, estimate) => sum + Number(estimate.total || 0), 0);
  const activity = state.auditLog.filter((event) => isWithinDateRange(event, from, to));
  const userActivity = activity.reduce((counts, event) => {
    counts[event.username] = (counts[event.username] || 0) + 1;
    return counts;
  }, {});
  const groupByStatus = (records) => records.reduce((groups, record) => {
    const status = record.status || 'Unassigned';
    if (!groups[status]) groups[status] = { count: 0, value: 0 };
    groups[status].count += 1;
    groups[status].value += Number(record.value || record.total || 0);
    return groups;
  }, {});

  return {
    from: from || null,
    to: to || null,
    leads: leads.length,
    jobs: jobs.length,
    estimates: estimates.length,
    customers: customers.length,
    jobRevenue,
    estimateValue,
    pipelineValue: leads.reduce((sum, lead) => sum + Number(lead.value || 0), 0),
    winRate: leads.length ? Math.round((jobs.length / leads.length) * 100) : 0,
    leadBreakdown: groupByStatus(leads),
    jobBreakdown: groupByStatus(jobs),
    estimateBreakdown: groupByStatus(estimates),
    activity,
    userActivity
  };
}

function addAuditEvent(state, user, action, recordType, record) {
  const recordName = recordType === 'estimate'
    ? (record.project || record.customer || String(record.id))
    : (record.name || record.customer || record.type || String(record.id));

  state.auditLog.unshift({
    id: Date.now() + Math.random(),
    createdAt: new Date().toISOString(),
    username: user.username,
    role: user.role,
    action,
    recordType,
    recordId: record.id,
    recordName
  });
}

function loadState(filePath) {
  if (filePath === ':memory:') {
    return JSON.parse(JSON.stringify(defaultState));
  }

  if (!fs.existsSync(filePath)) {
    return JSON.parse(JSON.stringify(defaultState));
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      leads: Array.isArray(parsed.leads) ? parsed.leads : defaultState.leads,
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : defaultState.jobs,
      estimates: Array.isArray(parsed.estimates) ? parsed.estimates : defaultState.estimates,
      customers: Array.isArray(parsed.customers) ? parsed.customers : defaultState.customers,
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : defaultState.auditLog
    };
  } catch (error) {
    return JSON.parse(JSON.stringify(defaultState));
  }
}

function saveState(filePath, state) {
  if (filePath === ':memory:') {
    return;
  }

  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function createStorage(persistFile, state) {
  if (persistFile === ':memory:' || !process.env.DATABASE_URL) {
    const localState = loadState(persistFile);
    Object.keys(state).forEach((collection) => {
      state[collection].push(...localState[collection]);
    });
    return {
      ready: Promise.resolve(),
      save: () => saveState(persistFile, state),
      close: async () => {}
    };
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });

  const ready = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_records (
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        data JSONB NOT NULL,
        PRIMARY KEY (collection, record_id)
      )
    `);

    const count = await pool.query('SELECT COUNT(*)::int AS count FROM crm_records');
    if (count.rows[0].count === 0) {
      const fileState = loadState(persistFile);
      if (Object.values(fileState).some((records) => records.length)) {
        await savePostgresState(pool, fileState);
      }
    }

    const result = await pool.query('SELECT collection, data FROM crm_records');
    const loaded = JSON.parse(JSON.stringify(defaultState));
    result.rows.forEach(({ collection, data }) => loaded[collection].push(data));
    Object.keys(loaded).forEach((collection) => {
      state[collection].splice(0, state[collection].length, ...loaded[collection]);
    });
  })();

  return {
    ready,
    save: () => savePostgresState(pool, state),
    close: () => pool.end()
  };
}

async function savePostgresState(pool, state) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM crm_records');
    for (const [collection, records] of Object.entries(state)) {
      for (const record of records) {
        await client.query(
          'INSERT INTO crm_records (collection, record_id, data) VALUES ($1, $2, $3)',
          [collection, String(record.id), record]
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function buildEstimate(body, existing = {}) {
  const lineItems = Array.isArray(body.lineItems)
    ? body.lineItems
        .map((item) => ({
          description: String(item.description || '').trim(),
          quantity: Math.max(0, Number(item.quantity) || 0),
          unitPrice: Math.max(0, Number(item.unitPrice) || 0)
        }))
        .filter((item) => item.description)
    : [];
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discount = Math.max(0, Number(body.discount) || 0);
  const taxRate = Math.max(0, Number(body.taxRate) || 0);
  const taxableAmount = Math.max(0, subtotal - discount);
  const tax = taxableAmount * (taxRate / 100);

  return {
    id: existing.id || Date.now(),
    createdAt: existing.createdAt || body.createdAt || new Date().toISOString(),
    customer: body.customer || 'New customer',
    phone: body.phone || '',
    email: body.email || '',
    project: body.project || 'Roof proposal',
    scope: body.scope || '',
    validUntil: body.validUntil || '',
    notes: body.notes || '',
    lineItems,
    subtotal,
    discount,
    taxRate,
    tax,
    total: taxableAmount + tax,
    status: body.status || 'Draft'
  };
}

function createApp(options = {}) {
  const persistFile = options.persistFile || path.join(__dirname, 'crm-data.json');
  const app = express();
  const state = JSON.parse(JSON.stringify(defaultState));
  const storage = createStorage(persistFile, state);
  app.locals.ready = storage.ready;
  app.locals.closeStorage = storage.close;
  const sessions = new Set();
  const username = process.env.CRM_USERNAME || 'admin';
  const password = process.env.CRM_PASSWORD || 'the password';
  const antonUsername = 'Anton';
  const antonPassword = process.env.CRM_ANTON_PASSWORD || '423martin';
  const viewerUsername = process.env.CRM_VIEWER_USERNAME || 'viewer';
  const viewerPassword = process.env.CRM_VIEWER_PASSWORD || 'view only';

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.post('/api/auth/login', (req, res) => {
    const isAdmin = req.body.username === username && req.body.password === password;
    const isAnton = req.body.username === antonUsername && req.body.password === antonPassword;
    const isViewer = req.body.username === viewerUsername && req.body.password === viewerPassword;
    if (!isAdmin && !isAnton && !isViewer) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.add({ token, username: isViewer ? viewerUsername : (isAnton ? antonUsername : username), role: isViewer ? 'viewer' : 'administrator' });
    res.setHeader('Set-Cookie', `crm_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
    return res.json({ username: isViewer ? viewerUsername : (isAnton ? antonUsername : username), role: isViewer ? 'viewer' : 'administrator' });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = (req.headers.cookie || '').match(/(?:^|; )crm_session=([^;]+)/)?.[1];
    if (token) {
      const session = [...sessions].find((item) => item.token === token);
      if (session) sessions.delete(session);
    }
    res.setHeader('Set-Cookie', 'crm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    res.status(204).end();
  });

  app.get('/api/auth/me', (req, res) => {
    const token = (req.headers.cookie || '').match(/(?:^|; )crm_session=([^;]+)/)?.[1];
    const session = [...sessions].find((item) => item.token === token);
    if (!session) return res.status(401).json({ authenticated: false });
    res.json({ authenticated: true, username: session.username, role: session.role });
  });

  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth/')) return next();
    const token = (req.headers.cookie || '').match(/(?:^|; )crm_session=([^;]+)/)?.[1];
    const session = [...sessions].find((item) => item.token === token);
    if (!session) return res.status(401).json({ error: 'Authentication required' });
    req.user = session;
    next();
  });

  app.use('/api', async (req, res, next) => {
    if (req.path.startsWith('/auth/')) return next();
    try {
      await app.locals.ready;
      next();
    } catch (error) {
      console.error('Database initialization failed', error);
      res.status(503).json({ error: 'Database unavailable' });
    }
  });

  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/auth/')) return next();
    if (req.user.role !== 'administrator') return res.status(403).json({ error: 'Administrator privileges required' });
    next();
  });

  app.get('/api/overview', (req, res) => {
    res.json(getOverview(state));
  });

  app.get('/api/leads', (req, res) => {
    res.json(state.leads);
  });

  app.get('/api/jobs', (req, res) => {
    res.json(state.jobs);
  });

  app.get('/api/estimates', (req, res) => {
    res.json(state.estimates);
  });

  app.get('/api/customers', (req, res) => {
    res.json(state.customers);
  });

  app.get('/api/reports', (req, res) => {
    res.json(getReport(state, req.query.from, req.query.to));
  });

  app.post('/api/leads', async (req, res) => {
    const lead = {
      id: Date.now(),
      createdAt: req.body.createdAt || new Date().toISOString(),
      customer: req.body.customer || 'New lead',
      phone: req.body.phone || '(210) 555-0000',
      source: req.body.source || 'Website',
      value: Number(req.body.value || 0),
      status: req.body.status || 'New',
      nextAction: req.body.nextAction || 'Follow up',
      stage: req.body.stage || 'New'
    };

    state.leads.unshift(lead);
    addAuditEvent(state, req.user, 'created', 'lead', lead);
    await storage.save();
    res.status(201).json(lead);
  });

  app.put('/api/leads/:id', async (req, res) => {
    const lead = state.leads.find((item) => String(item.id) === req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    Object.assign(lead, {
      customer: req.body.customer || lead.customer,
      phone: req.body.phone || '',
      source: req.body.source || '',
      value: Number(req.body.value || 0),
      status: req.body.status || 'New',
      nextAction: req.body.nextAction || 'Follow up',
      stage: req.body.stage || lead.stage || 'New'
    });
    addAuditEvent(state, req.user, 'updated', 'lead', lead);
    await storage.save();
    res.json(lead);
  });

  app.delete('/api/leads/:id', async (req, res) => {
    const index = state.leads.findIndex((item) => String(item.id) === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Lead not found' });

    const [lead] = state.leads.splice(index, 1);
    addAuditEvent(state, req.user, 'deleted', 'lead', lead);
    await storage.save();
    res.json({ deleted: true, id: lead.id });
  });

  app.post('/api/jobs', async (req, res) => {
    const job = {
      id: Date.now(),
      createdAt: req.body.createdAt || new Date().toISOString(),
      customer: req.body.customer || 'New job',
      phone: req.body.phone || '',
      email: req.body.email || '',
      address: req.body.address || '',
      type: req.body.type || 'Roofing job',
      scope: req.body.scope || '',
      materials: req.body.materials || '',
      value: Number(req.body.value || 0),
      status: req.body.status || 'Scheduled',
      crew: req.body.crew || 'Crew A',
      nextMilestone: req.body.nextMilestone || 'Site review',
      scheduledDate: req.body.scheduledDate || '',
      completionDate: req.body.completionDate || '',
      notes: req.body.notes || ''
    };

    state.jobs.unshift(job);
    addAuditEvent(state, req.user, 'created', 'job', job);
    await storage.save();
    res.status(201).json(job);
  });

  app.post('/api/estimates/:id/convert-to-job', async (req, res) => {
    const estimate = state.estimates.find((item) => String(item.id) === req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    const job = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      estimateId: estimate.id,
      customer: estimate.customer,
      phone: estimate.phone || '',
      email: estimate.email || '',
      address: req.body.address || '',
      type: req.body.type || estimate.project,
      scope: estimate.scope || '',
      materials: req.body.materials || estimate.lineItems.map((item) => item.description).join(', '),
      value: Number(estimate.total || 0),
      status: 'Scheduled',
      crew: req.body.crew || 'Crew A',
      nextMilestone: req.body.nextMilestone || 'Schedule site work',
      scheduledDate: req.body.scheduledDate || '',
      completionDate: '',
      notes: req.body.notes || estimate.notes || ''
    };

    state.jobs.unshift(job);
    addAuditEvent(state, req.user, 'converted estimate to job', 'job', job);
    await storage.save();
    res.status(201).json(job);
  });

  app.put('/api/jobs/:id', async (req, res) => {
    const job = state.jobs.find((item) => String(item.id) === req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    Object.assign(job, {
      customer: req.body.customer || job.customer,
      phone: req.body.phone || '',
      email: req.body.email || '',
      address: req.body.address || '',
      type: req.body.type || 'Roofing job',
      scope: req.body.scope || '',
      materials: req.body.materials || '',
      value: Number(req.body.value || 0),
      status: req.body.status || 'Scheduled',
      crew: req.body.crew || 'Crew A',
      nextMilestone: req.body.nextMilestone || 'Site review',
      scheduledDate: req.body.scheduledDate || '',
      completionDate: req.body.completionDate || '',
      notes: req.body.notes || ''
    });
    addAuditEvent(state, req.user, 'updated', 'job', job);
    await storage.save();
    res.json(job);
  });

  app.delete('/api/jobs/:id', async (req, res) => {
    const index = state.jobs.findIndex((item) => String(item.id) === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Job not found' });

    const [job] = state.jobs.splice(index, 1);
    addAuditEvent(state, req.user, 'deleted', 'job', job);
    await storage.save();
    res.json({ deleted: true, id: job.id });
  });

  app.post('/api/customers', async (req, res) => {
    const customer = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      name: req.body.name || 'New customer',
      phone: req.body.phone || '',
      email: req.body.email || '',
      address: req.body.address || '',
      notes: req.body.notes || '',
      status: req.body.status || 'Active'
    };

    state.customers.unshift(customer);
    addAuditEvent(state, req.user, 'created', 'customer', customer);
    await storage.save();
    res.status(201).json(customer);
  });

  app.put('/api/customers/:id', async (req, res) => {
    const customer = state.customers.find((item) => String(item.id) === req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    Object.assign(customer, {
      name: req.body.name || customer.name,
      phone: req.body.phone || '',
      email: req.body.email || '',
      address: req.body.address || '',
      notes: req.body.notes || '',
      status: req.body.status || 'Active'
    });
    addAuditEvent(state, req.user, 'updated', 'customer', customer);
    await storage.save();
    res.json(customer);
  });

  app.delete('/api/customers/:id', async (req, res) => {
    const index = state.customers.findIndex((item) => String(item.id) === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Customer not found' });

    const [customer] = state.customers.splice(index, 1);
    addAuditEvent(state, req.user, 'deleted', 'customer', customer);
    await storage.save();
    res.json({ deleted: true, id: customer.id });
  });

  app.post('/api/estimates', async (req, res) => {
    const estimate = buildEstimate(req.body);

    state.estimates.unshift(estimate);
    addAuditEvent(state, req.user, 'created', 'estimate', estimate);
    await storage.save();
    res.status(201).json(estimate);
  });

  app.put('/api/estimates/:id', async (req, res) => {
    const estimate = state.estimates.find((item) => String(item.id) === req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    Object.assign(estimate, buildEstimate(req.body, estimate));
    addAuditEvent(state, req.user, 'updated', 'estimate', estimate);
    await storage.save();
    res.json(estimate);
  });

  app.delete('/api/estimates/:id', async (req, res) => {
    const index = state.estimates.findIndex((item) => String(item.id) === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Estimate not found' });

    const [estimate] = state.estimates.splice(index, 1);
    addAuditEvent(state, req.user, 'deleted', 'estimate', estimate);
    await storage.save();
    res.json({ deleted: true, id: estimate.id });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const app = createApp();
  app.locals.ready
    .then(() => app.listen(PORT, () => {
      console.log(`MCR CRM running on http://localhost:${PORT}`);
    }))
    .catch((error) => {
      console.error('Unable to start CRM database:', error.message);
      process.exitCode = 1;
    });
}

module.exports = { buildEstimate, createApp, getOverview, getReport, isWithinDateRange, loadState, defaultState };
