const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

let currentRole = 'administrator';

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Request failed');
  }
  return response.json();
}

function renderOverview(data) {
  const cards = [
    { label: 'Total leads', value: data.totalLeads, change: '+12% vs last month' },
    { label: 'Booked jobs', value: data.bookedJobs, change: '+3 this week' },
    { label: 'Revenue', value: money.format(data.revenueThisMonth), change: '+9.4%' },
    { label: 'Follow ups', value: data.followUpsDue, change: '2 due today' },
    { label: 'Win rate', value: `${data.winRate}%`, change: 'Healthy pipeline' }
  ];

  document.getElementById('overview').innerHTML = cards
    .map(
      (card) => `
        <div class="metric-card">
          <div class="metric-label">${card.label}</div>
          <div class="metric-value">${card.value}</div>
          <div class="metric-change">${card.change}</div>
        </div>
      `
    )
    .join('');
}

function renderLeads(leads, targetId = 'leads') {
  const root = document.getElementById(targetId);
  if (!root) return;

  root.innerHTML = leads
    .map(
      (lead) => `
        <div class="lead-row">
          <div class="lead-main">
            <strong>${lead.customer}</strong>
            <div class="meta">${lead.phone} • ${lead.source}</div>
          </div>
          <div>
            <strong>${money.format(lead.value)}</strong>
            <div class="meta">Project value</div>
          </div>
          <div>
            <strong>${lead.stage}</strong>
            <div class="meta">${lead.status}</div>
          </div>
          <span class="badge">${lead.nextAction}</span>
          <button class="secondary-btn edit-lead" data-id="${lead.id}" type="button">Edit</button>
          <button class="danger-btn delete-lead" data-id="${lead.id}" type="button">Delete</button>
        </div>
      `
    )
    .join('');
}

function renderJobs(jobs, targetId = 'jobs') {
  const root = document.getElementById(targetId);
  if (!root) return;

  root.innerHTML = jobs
    .map(
      (job) => `
        <div class="job-row">
          <div>
            <strong>${job.customer}</strong>
            <div class="meta">${job.type}</div>
          </div>
          <div>
            <strong>${job.status}</strong>
            <div class="meta">Job status</div>
          </div>
          <div>
            <strong>${job.crew}</strong>
            <div class="meta">${job.scheduledDate ? `Starts ${job.scheduledDate}` : 'Crew'}</div>
          </div>
          <div>
            <strong>${money.format(job.value)}</strong>
            <div class="meta">${job.nextMilestone}${job.address ? ` • ${job.address}` : ''}</div>
          </div>
          <button class="secondary-btn edit-job" data-id="${job.id}" type="button">Edit</button>
          <button class="danger-btn delete-job" data-id="${job.id}" type="button">Delete</button>
        </div>
      `
    )
    .join('');
}

function renderEstimates(estimates, targetId = 'estimates') {
  const root = document.getElementById(targetId);
  if (!root) return;

  root.innerHTML = estimates
    .map(
      (estimate) => `
        <div class="estimate-row">
          <div>
            <strong>${estimate.customer}</strong>
            <div class="meta">${estimate.project}${estimate.scope ? ` • ${estimate.scope}` : ''}</div>
          </div>
          <div>
            <strong>${money.format(estimate.total)}</strong>
            <div class="meta">${estimate.lineItems?.length || 0} line items</div>
          </div>
          <div>
            <strong>${money.format(estimate.subtotal || estimate.total)}</strong>
            <div class="meta">Subtotal${estimate.taxRate ? ` • ${estimate.taxRate}% tax` : ''}</div>
          </div>
          <span class="badge">${estimate.status}</span>
          <button class="secondary-btn view-estimate" data-id="${estimate.id}" type="button">View</button>
          <button class="secondary-btn edit-estimate" data-id="${estimate.id}" type="button">Edit</button>
          <button class="danger-btn delete-estimate" data-id="${estimate.id}" type="button">Delete</button>
        </div>
      `
    )
    .join('');
}

function renderEstimateOverview(estimates) {
  const root = document.getElementById('estimate-overview');
  if (!root) return;
  const totalValue = estimates.reduce((sum, estimate) => sum + Number(estimate.total || 0), 0);
  const openCount = estimates.filter((estimate) => !['approved', 'declined'].includes((estimate.status || '').toLowerCase())).length;
  const average = estimates.length ? totalValue / estimates.length : 0;
  const cards = [
    { label: 'Total estimates', value: String(estimates.length), tone: 'neutral' },
    { label: 'Open quotes', value: String(openCount), tone: 'green' },
    { label: 'Quoted value', value: money.format(totalValue), tone: 'blue' },
    { label: 'Average estimate', value: money.format(average), tone: 'gold' }
  ];
  root.innerHTML = cards.map((card) => `
    <div class="estimate-stat ${card.tone}">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
    </div>
  `).join('');
}

function renderEstimateDetail(estimate) {
  const root = document.getElementById('estimate-detail');
  if (!root) return;

  const items = (estimate.lineItems || []).map((item) => `
    <tr>
      <td>${item.description}</td>
      <td>${item.quantity}</td>
      <td>${money.format(item.unitPrice)}</td>
      <td>${money.format(item.quantity * item.unitPrice)}</td>
    </tr>
  `).join('');

  root.innerHTML = `
    <div class="estimate-detail-header">
      <div>
        <p class="eyebrow">Estimate</p>
        <h3>${estimate.project}</h3>
        <div class="meta">${estimate.customer}${estimate.phone ? ` • ${estimate.phone}` : ''}${estimate.email ? ` • ${estimate.email}` : ''}</div>
      </div>
      <div class="estimate-detail-actions">
        <span class="badge">${estimate.status}</span>
        <button class="primary-btn convert-estimate" data-id="${estimate.id}" type="button">Create job</button>
        <button class="secondary-btn email-estimate" type="button">Send to customer</button>
        <button class="primary-btn print-estimate" type="button">Print / Save PDF</button>
      </div>
    </div>
    ${estimate.scope ? `<p class="estimate-scope"><strong>Scope:</strong> ${estimate.scope}</p>` : ''}
    <table class="estimate-table">
      <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
      <tbody>${items || '<tr><td colspan="4">No line items added</td></tr>'}</tbody>
    </table>
    <div class="estimate-summary">
      <div><span>Subtotal</span><strong>${money.format(estimate.subtotal || 0)}</strong></div>
      <div><span>Discount</span><strong>-${money.format(estimate.discount || 0)}</strong></div>
      <div><span>Tax${estimate.taxRate ? ` (${estimate.taxRate}%)` : ''}</span><strong>${money.format(estimate.tax || 0)}</strong></div>
      <div class="estimate-grand-total"><span>Total</span><strong>${money.format(estimate.total || 0)}</strong></div>
    </div>
    <div class="estimate-customer-footer">Prepared for ${estimate.customer}${estimate.validUntil ? ` • Valid through ${estimate.validUntil}` : ''}</div>
    ${estimate.validUntil ? `<div class="meta">Valid until ${estimate.validUntil}</div>` : ''}
    ${estimate.notes ? `<p class="estimate-notes"><strong>Notes:</strong> ${estimate.notes}</p>` : ''}
  `;
  root.hidden = false;
  applyPermissions(currentRole);
  root.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sendEstimateToCustomer(estimate) {
  const subject = encodeURIComponent(`Estimate: ${estimate.project}`);
  const body = encodeURIComponent(`Hello ${estimate.customer},\n\nYour estimate for ${estimate.project} totals ${money.format(estimate.total || 0)}. I have attached the estimate PDF.\n\nThank you.`);
  const recipient = encodeURIComponent(estimate.email || '');
  window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
}

async function viewEstimate(estimateId) {
  const estimates = await fetchJson('/api/estimates');
  const estimate = estimates.find((item) => String(item.id) === String(estimateId));
  if (estimate) {
    setActiveTab('estimates');
    renderEstimateDetail(estimate);
  }
}

async function convertEstimateToJob(estimateId) {
  const estimates = await fetchJson('/api/estimates');
  const estimate = estimates.find((item) => String(item.id) === String(estimateId));
  if (!estimate) return;

  const response = await fetch(`/api/estimates/${estimateId}/convert-to-job`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (!response.ok) throw new Error('Failed to convert estimate to job');

  const job = await response.json();
  await loadDashboard();
  setActiveTab('jobs');
  await editJob(job.id);
}

async function deleteEstimate(estimateId) {
  if (!window.confirm('Delete this estimate permanently?')) return;
  const response = await fetch(`/api/estimates/${estimateId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete estimate');
  document.getElementById('estimate-detail').hidden = true;
  await loadDashboard();
  setActiveTab('estimates');
}

async function deleteCustomer(customerId) {
  if (!window.confirm('Delete this customer permanently?')) return;
  const response = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete customer');
  await loadDashboard();
  setActiveTab('customers');
}

function renderCustomers(customers) {
  const root = document.getElementById('customers');
  if (!root) return;

  root.innerHTML = customers
    .map(
      (customer) => `
        <div class="customer-card">
          <strong>${customer.name}</strong>
          <div class="meta">${customer.phone}</div>
          <div class="meta">${customer.email || 'No email'} • ${customer.status}</div>
          <div class="meta">${customer.address || 'No address saved'}</div>
          <button class="secondary-btn edit-customer" data-id="${customer.id}" type="button">Edit</button>
          <button class="danger-btn delete-customer" data-id="${customer.id}" type="button">Delete</button>
        </div>
      `
    )
    .join('');
}

function renderReports(report) {
  const root = document.getElementById('reports');
  if (!root) return;

  const reportCards = [
    { title: 'Leads', value: String(report.leads) },
    { title: 'Jobs', value: String(report.jobs) },
    { title: 'Pipeline value', value: money.format(report.pipelineValue) },
    { title: 'Job revenue', value: money.format(report.jobRevenue) },
    { title: 'Estimates', value: String(report.estimates) },
    { title: 'Estimate value', value: money.format(report.estimateValue) },
    { title: 'Customers added', value: String(report.customers) },
    { title: 'Win rate', value: `${report.winRate}%` }
  ];

  root.innerHTML = reportCards
    .map(
      (card) => `
        <div class="report-card">
          <strong>${card.title}</strong>
          <div class="meta">${card.value}</div>
        </div>
      `
    )
    .join('') + `
      <div class="activity-panel">
        <div class="panel-header">
          <h3>User activity</h3>
          <span>${report.activity.length} actions</span>
        </div>
        <div class="activity-summary">
          ${Object.entries(report.userActivity).map(([user, count]) => `<span class="badge">${user}: ${count}</span>`).join('') || '<span class="meta">No activity in this range</span>'}
        </div>
        <div class="activity-list">
          ${report.activity.slice(0, 20).map((event) => `
            <div class="activity-row">
              <div>
                <strong>${event.username}</strong>
                <div class="meta">${event.action} ${event.recordType}: ${event.recordName}</div>
              </div>
              <time class="meta">${new Date(event.createdAt).toLocaleString()}</time>
            </div>
          `).join('') || '<div class="meta">No user activity recorded yet</div>'}
        </div>
      </div>
    ` + `
      <div class="report-breakdown">
        ${renderReportBreakdown('Lead pipeline', report.leadBreakdown, 'leads')}
        ${renderReportBreakdown('Job status', report.jobBreakdown, 'jobs')}
        ${renderReportBreakdown('Estimate status', report.estimateBreakdown, 'estimates')}
      </div>
    `;
}

function renderReportBreakdown(title, groups, type) {
  const rows = Object.entries(groups).map(([status, data]) => `
    <div class="breakdown-row">
      <div><strong>${status}</strong><div class="meta">${data.count} ${type}</div></div>
      <strong>${money.format(data.value)}</strong>
    </div>
  `).join('');

  return `
    <div class="breakdown-card">
      <h3>${title}</h3>
      ${rows || '<div class="meta">No records in this range</div>'}
    </div>
  `;
}

async function loadDashboard() {
  try {
    const [overview, leads, jobs, estimates, customers] = await Promise.all([
      fetchJson('/api/overview'),
      fetchJson('/api/leads'),
      fetchJson('/api/jobs'),
      fetchJson('/api/estimates'),
      fetchJson('/api/customers')
    ]);

    renderOverview(overview);
    renderLeads(leads);
    renderJobs(jobs);
    renderEstimates(estimates);
    renderEstimateOverview(estimates);
    renderLeads(leads, 'lead-list-full');
    renderJobs(jobs, 'job-list-full');
    renderEstimates(estimates, 'estimate-list-full');
    renderCustomers(customers);
    const report = await fetchJson('/api/reports');
    renderReports(report);
    applyPermissions(currentRole);
  } catch (error) {
    console.error('Unable to load CRM data', error);
  }
}

async function saveCustomer(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  const id = form.dataset.customerId;
  const response = await fetch(id ? `/api/customers/${id}` : '/api/customers', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Failed to save customer');
  form.reset();
  delete form.dataset.customerId;
  document.getElementById('customer-form-title').textContent = 'Add customer';
  document.getElementById('customer-form-submit').textContent = 'Save customer';
  await loadDashboard();
}

async function runReport() {
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const label = document.getElementById('report-range-label');

  if (from && to && from > to) {
    label.textContent = 'Start date must be before end date';
    return;
  }

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const report = await fetchJson(`/api/reports?${params.toString()}`);
  renderReports(report);
  label.textContent = from || to ? `${from || 'Beginning'} to ${to || 'Today'}` : 'All time';
}

async function handleLeadSubmit(form, endpoint = '/api/leads') {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  const leadId = form.dataset.leadId;
  const response = await fetch(leadId ? `/api/leads/${leadId}` : endpoint, {
    method: leadId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Failed to save lead');
  }

  form.reset();
  delete form.dataset.leadId;
  document.querySelectorAll('.lead-form-title').forEach((title) => { title.textContent = 'Add lead'; });
  document.querySelectorAll('.lead-form-submit').forEach((button) => { button.textContent = 'Save lead'; });
  await loadDashboard();
}

async function editLead(leadId) {
  const leads = await fetchJson('/api/leads');
  const lead = leads.find((item) => String(item.id) === String(leadId));
  if (!lead) return;

  setActiveTab('leads');
  const form = document.getElementById('lead-form-full');
  form.dataset.leadId = lead.id;
  ['customer', 'phone', 'source', 'value', 'status'].forEach((field) => {
    form.elements[field].value = lead[field] ?? '';
  });
  form.elements.nextAction.value = lead.nextAction || 'Follow up';
  form.elements.stage.value = lead.stage || 'New';
  document.getElementById('lead-form-full').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelector('#leads-panel .lead-form-title').textContent = 'Edit lead';
  document.querySelector('#leads-panel .lead-form-submit').textContent = 'Update lead';
}

async function deleteLead(leadId) {
  if (!window.confirm('Delete this lead permanently?')) return;
  const response = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete lead');
  await loadDashboard();
  setActiveTab('leads');
}

async function handleJobSubmit(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const jobId = form.dataset.jobId;

  const response = await fetch(jobId ? `/api/jobs/${jobId}` : '/api/jobs', {
    method: jobId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Failed to save job');
  }

  form.reset();
  delete form.dataset.jobId;
  document.getElementById('job-form-title').textContent = 'Add job';
  document.getElementById('job-form-submit').textContent = 'Save job';
  await loadDashboard();
}

async function editJob(jobId) {
  const jobs = await fetchJson('/api/jobs');
  const job = jobs.find((item) => String(item.id) === String(jobId));
  if (!job) return;

  setActiveTab('jobs');
  const form = document.getElementById('job-form');
  form.dataset.jobId = job.id;
  ['customer', 'phone', 'email', 'address', 'type', 'scope', 'materials', 'value', 'status', 'crew', 'nextMilestone', 'scheduledDate', 'completionDate', 'notes'].forEach((field) => {
    form.elements[field].value = job[field] ?? '';
  });
  document.getElementById('job-form-title').textContent = 'Edit job';
  document.getElementById('job-form-submit').textContent = 'Update job';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteJob(jobId) {
  if (!window.confirm('Delete this job permanently?')) return;
  const response = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete job');
  await loadDashboard();
  setActiveTab('jobs');
}

function startNewJob() {
  setActiveTab('jobs');
  const form = document.getElementById('job-form');
  form.reset();
  delete form.dataset.jobId;
  document.getElementById('job-form-title').textContent = 'Add job';
  document.getElementById('job-form-submit').textContent = 'Save job';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleEstimateSubmit(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.lineItems = [...form.querySelectorAll('.line-item')].map((row) => ({
    description: row.querySelector('[name="description"]').value,
    quantity: row.querySelector('[name="quantity"]').value,
    unitPrice: row.querySelector('[name="unitPrice"]').value
  }));

  const estimateId = form.dataset.estimateId;
  const response = await fetch(estimateId ? `/api/estimates/${estimateId}` : '/api/estimates', {
    method: estimateId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Failed to save estimate');
  }

  form.reset();
  delete form.dataset.estimateId;
  document.getElementById('estimate-form-title').textContent = 'Create estimate';
  document.getElementById('estimate-form-submit').textContent = 'Create estimate';
  resetEstimateLineItems();
  await loadDashboard();
}

function resetEstimateLineItems() {
  const items = document.getElementById('estimate-line-items');
  if (!items) return;
  items.innerHTML = `
    <div class="line-item">
      <input name="description" placeholder="Description" required />
      <input name="quantity" type="number" min="0" step="0.01" value="1" placeholder="Qty" aria-label="Quantity" required />
      <input name="unitPrice" type="number" min="0" step="0.01" placeholder="Unit price" aria-label="Unit price" required />
      <button class="icon-btn remove-line-item" type="button" aria-label="Remove line item">Remove</button>
    </div>
  `;
  updateEstimateTotal();
}

async function editEstimate(estimateId) {
  const estimates = await fetchJson('/api/estimates');
  const estimate = estimates.find((item) => String(item.id) === String(estimateId));
  if (!estimate) return;

  setActiveTab('estimates');
  const form = document.getElementById('estimate-form');
  form.dataset.estimateId = estimate.id;
  ['customer', 'phone', 'email', 'project', 'validUntil', 'status', 'scope', 'discount', 'taxRate', 'notes'].forEach((field) => {
    form.elements[field].value = estimate[field] ?? '';
  });
  const items = document.getElementById('estimate-line-items');
  items.innerHTML = '';
  (estimate.lineItems || []).forEach((item) => {
    addEstimateLineItem();
    const row = items.lastElementChild;
    row.querySelector('[name="description"]').value = item.description;
    row.querySelector('[name="quantity"]').value = item.quantity;
    row.querySelector('[name="unitPrice"]').value = item.unitPrice;
  });
  if (!items.children.length) addEstimateLineItem();
  updateEstimateTotal();
  document.getElementById('estimate-form-title').textContent = 'Edit estimate';
  document.getElementById('estimate-form-submit').textContent = 'Update estimate';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateEstimateTotal() {
  const form = document.getElementById('estimate-form');
  const preview = document.getElementById('estimate-total-preview');
  if (!form || !preview) return;

  const subtotal = [...form.querySelectorAll('.line-item')].reduce((sum, row) => {
    const quantity = Number(row.querySelector('[name="quantity"]').value) || 0;
    const unitPrice = Number(row.querySelector('[name="unitPrice"]').value) || 0;
    return sum + quantity * unitPrice;
  }, 0);
  const discount = Number(form.elements.discount.value) || 0;
  const taxRate = Number(form.elements.taxRate.value) || 0;
  const total = Math.max(0, subtotal - discount) * (1 + taxRate / 100);
  preview.textContent = `Total ${money.format(total)}`;
}

function addEstimateLineItem() {
  const items = document.getElementById('estimate-line-items');
  const row = document.createElement('div');
  row.className = 'line-item';
  row.innerHTML = `
    <input name="description" placeholder="Description" required />
    <input name="quantity" type="number" min="0" step="0.01" value="1" placeholder="Qty" aria-label="Quantity" required />
    <input name="unitPrice" type="number" min="0" step="0.01" placeholder="Unit price" aria-label="Unit price" required />
    <button class="icon-btn remove-line-item" type="button" aria-label="Remove line item">Remove</button>
  `;
  items.appendChild(row);
  updateEstimateTotal();
}

const navButtons = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.tab-panel');
const pageTitle = document.getElementById('page-title');

const titles = {
  dashboard: 'Operations dashboard',
  leads: 'Lead management',
  jobs: 'Job tracking',
  estimates: 'Estimate center',
  customers: 'Customer directory',
  reports: 'Reporting dashboard'
};

function setActiveTab(tabName) {
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === `${tabName}-panel`));
  pageTitle.textContent = titles[tabName] || 'Operations dashboard';
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

document.getElementById('brand-home')?.addEventListener('click', () => setActiveTab('dashboard'));

document.getElementById('lead-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleLeadSubmit(event.target);
});

document.getElementById('lead-form-full').addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleLeadSubmit(event.target);
  setActiveTab('leads');
});

document.querySelectorAll('.table-list').forEach((list) => {
  list.addEventListener('click', (event) => {
    const button = event.target.closest('.edit-lead');
    if (button) editLead(button.dataset.id);
    const deleteButton = event.target.closest('.delete-lead');
    if (deleteButton) deleteLead(deleteButton.dataset.id);
  });
});

document.getElementById('job-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleJobSubmit(event.target);
  setActiveTab('jobs');
});
document.getElementById('create-job-action')?.addEventListener('click', startNewJob);

document.querySelectorAll('.jobs-list').forEach((list) => {
  list.addEventListener('click', (event) => {
    const button = event.target.closest('.edit-job');
    if (button) editJob(button.dataset.id);
    const deleteButton = event.target.closest('.delete-job');
    if (deleteButton) deleteJob(deleteButton.dataset.id);
  });
});

document.getElementById('estimate-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleEstimateSubmit(event.target);
  setActiveTab('estimates');
});

document.getElementById('add-line-item')?.addEventListener('click', addEstimateLineItem);
document.getElementById('estimate-line-items')?.addEventListener('click', (event) => {
  if (!event.target.classList.contains('remove-line-item')) return;
  const rows = document.querySelectorAll('#estimate-line-items .line-item');
  if (rows.length > 1) event.target.closest('.line-item').remove();
  updateEstimateTotal();
});
document.getElementById('estimate-form')?.addEventListener('input', updateEstimateTotal);
document.getElementById('run-report')?.addEventListener('click', runReport);
document.querySelectorAll('.estimate-list').forEach((list) => {
  list.addEventListener('click', (event) => {
    const button = event.target.closest('.view-estimate');
    if (button) viewEstimate(button.dataset.id);
    const editButton = event.target.closest('.edit-estimate');
    if (editButton) editEstimate(editButton.dataset.id);
    const deleteButton = event.target.closest('.delete-estimate');
    if (deleteButton) deleteEstimate(deleteButton.dataset.id);
  });
});
document.getElementById('estimate-detail')?.addEventListener('click', (event) => {
  if (event.target.closest('.print-estimate')) window.print();
  if (event.target.closest('.email-estimate')) {
    const estimateId = event.target.closest('.estimate-detail-panel').querySelector('.convert-estimate').dataset.id;
    fetchJson('/api/estimates').then((estimates) => {
      const estimate = estimates.find((item) => String(item.id) === String(estimateId));
      if (estimate) sendEstimateToCustomer(estimate);
    });
  }
  const convertButton = event.target.closest('.convert-estimate');
  if (convertButton) convertEstimateToJob(convertButton.dataset.id);
});
document.getElementById('customer-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveCustomer(event.target);
});
document.getElementById('customers')?.addEventListener('click', async (event) => {
  const deleteButton = event.target.closest('.delete-customer');
  if (deleteButton) {
    await deleteCustomer(deleteButton.dataset.id);
    return;
  }
  const button = event.target.closest('.edit-customer');
  if (!button) return;
  const customer = await fetchJson('/api/customers');
  const selected = customer.find((item) => String(item.id) === button.dataset.id);
  if (!selected) return;
  const form = document.getElementById('customer-form');
  form.dataset.customerId = selected.id;
  ['name', 'phone', 'email', 'address', 'notes', 'status'].forEach((field) => {
    form.elements[field].value = selected[field] || '';
  });
  document.getElementById('customer-form-title').textContent = 'Edit customer';
  document.getElementById('customer-form-submit').textContent = 'Update customer';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

async function initializeAuth() {
  const loginScreen = document.getElementById('login-screen');
  const appShell = document.querySelector('.app-shell');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');

  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const user = await response.json();
      loginScreen.hidden = true;
      appShell.hidden = false;
      applyPermissions(user.role);
      setActiveTab('dashboard');
      await loadDashboard();
    }
  } catch (error) {
    loginError.textContent = 'Unable to connect to the CRM';
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.textContent = '';
    const payload = Object.fromEntries(new FormData(loginForm).entries());
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      loginError.textContent = 'Invalid username or password';
      return;
    }

    const user = await response.json();
    loginForm.reset();
    loginScreen.hidden = true;
    appShell.hidden = false;
    applyPermissions(user.role);
    setActiveTab('dashboard');
    await loadDashboard();
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    appShell.hidden = true;
    loginScreen.hidden = false;
  });
}

function applyPermissions(role) {
  const isViewer = role === 'viewer';
  currentRole = role;
  document.getElementById('viewer-notice').hidden = !isViewer;
  document.querySelectorAll('.form-panel, .edit-lead, .edit-job, .edit-estimate, .create-job-action, .delete-lead, .delete-job, .delete-customer, .delete-estimate, .convert-estimate, .email-estimate').forEach((element) => {
    element.hidden = isViewer;
  });
}

document.querySelector('.app-shell').hidden = true;
initializeAuth();
