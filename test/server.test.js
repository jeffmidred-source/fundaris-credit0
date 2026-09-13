const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../server');

test('GET /api/health returns ok status', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('POST /api/chat/message creates a live support conversation and admin list is accessible', async () => {
  const createRes = await request(app)
    .post('/api/chat/message')
    .send({
      visitorName: 'Jane Visitor',
      visitorEmail: 'jane@example.com',
      message: 'I need help with my account balance.',
      sourcePage: 'homepage'
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.success, true);
  assert.match(createRes.body.data.message, /account balance/i);

  const adminRes = await request(app)
    .get('/api/chat/messages')
    .query({ adminUsername: 'kumasi', adminPassword: 'admin123' });

  assert.equal(adminRes.status, 200);
  assert.equal(adminRes.body.success, true);
  assert.ok(Array.isArray(adminRes.body.data));
});

test('POST /api/contact accepts valid contact details', async () => {
  const res = await request(app)
    .post('/api/contact')
    .send({
      name: 'Ama Mensah',
      email: 'ama@example.com',
      phone: '+233 20 000 0000',
      message: 'I would like to know more about your loan products.'
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.match(res.body.message, /received/i);
});

test('POST /api/contact rejects incomplete details', async () => {
  const res = await request(app)
    .post('/api/contact')
    .send({
      name: 'Ama Mensah',
      email: 'ama@example.com'
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('POST /api/register and /api/login create a customer account and allow status lookup', async () => {
  const uniqueEmail = `nana.${Date.now()}@example.com`;

  const registerRes = await request(app)
    .post('/api/register')
    .send({
      fullName: 'Nana Owusu',
      email: uniqueEmail,
      phone: '+233 20 555 0000',
      password: 'StrongPass1!'
    });

  assert.equal(registerRes.status, 201);
  assert.equal(registerRes.body.success, true);
  assert.equal(registerRes.body.user.email, uniqueEmail);

  const loginRes = await request(app)
    .post('/api/login')
    .send({
      email: uniqueEmail,
      password: 'StrongPass1!'
    });

  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.success, true);

  const statusRes = await request(app)
    .get('/api/user/dashboard')
    .query({ userId: loginRes.body.user.id });

  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.success, true);
  assert.equal(statusRes.body.user.email, uniqueEmail);
});

test('authenticated loan applications are visible in the admin dashboard', async () => {
  const uniqueEmail = `admin-loan.${Date.now()}@example.com`;

  const registerRes = await request(app)
    .post('/api/register')
    .send({
      fullName: 'Admin Loan Applicant',
      email: uniqueEmail,
      phone: '+233 20 555 1111',
      password: 'StrongPass1!'
    });

  const loanRes = await request(app)
    .post('/api/user/loan-application')
    .send({
      userId: registerRes.body.user.id,
      product: 'Personal Loan',
      amount: '5000',
      term: '12 months'
    });

  assert.equal(loanRes.status, 201);

  const dashboardRes = await request(app).get('/api/dashboard');
  const application = dashboardRes.body.loanApplications.find((item) => item.id === loanRes.body.data.id);

  assert.equal(dashboardRes.status, 200);
  assert.ok(application);
  assert.equal(application.email, uniqueEmail);
  assert.equal(application.status, 'Pending review');
});

test('POST /api/admin/review-verification updates uploaded verification status', async () => {
  const uniqueEmail = `review.${Date.now()}@example.com`;

  const registerRes = await request(app)
    .post('/api/register')
    .send({
      fullName: 'Akosua Boateng',
      email: uniqueEmail,
      phone: '+233 20 666 0000',
      password: 'StrongPass1!'
    });

  const uploadRes = await request(app)
    .post('/api/user/upload-verification')
    .send({
      userId: registerRes.body.user.id,
      documentType: 'id_card',
      fileName: 'akosua-id.png',
      fileUrl: 'https://example.com/akosua-id.png'
    });

  assert.equal(uploadRes.status, 201);

  const reviewRes = await request(app)
    .post('/api/admin/review-verification')
    .send({
      adminUsername: 'kumasi',
      adminPassword: 'admin123',
      uploadId: uploadRes.body.data.id,
      decision: 'approved'
    });

  assert.equal(reviewRes.status, 200);
  assert.equal(reviewRes.body.success, true);
  assert.equal(reviewRes.body.data.reviewed, true);
});

test('POST /api/admin/fund-user-account funds approved loans and POST /api/user/withdrawal-request records admin-only withdrawals', async () => {
  const uniqueEmail = `wallet.${Date.now()}@example.com`;

  const registerRes = await request(app)
    .post('/api/register')
    .send({
      fullName: 'Kojo Mensah',
      email: uniqueEmail,
      phone: '+233 20 777 0000',
      password: 'StrongPass1!'
    });

  assert.equal(registerRes.status, 201);

  const loanRes = await request(app)
    .post('/api/user/loan-application')
    .send({
      userId: registerRes.body.user.id,
      product: 'Business Loan',
      amount: '1500',
      term: '12 months'
    });

  assert.equal(loanRes.status, 201);

  const approveRes = await request(app)
    .post('/api/admin/update-loan-status')
    .send({
      adminUsername: 'kumasi',
      adminPassword: 'admin123',
      applicationId: loanRes.body.data.id,
      status: 'Approved'
    });

  assert.equal(approveRes.status, 200);

  const fundRes = await request(app)
    .post('/api/admin/fund-user-account')
    .send({
      adminUsername: 'kumasi',
      adminPassword: 'admin123',
      userId: registerRes.body.user.id,
      amount: 1500
    });

  assert.equal(fundRes.status, 200);
  assert.equal(fundRes.body.success, true);
  assert.equal(fundRes.body.data.balance, 1500);

  const withdrawalRes = await request(app)
    .post('/api/user/withdrawal-request')
    .send({
      userId: registerRes.body.user.id,
      amount: 500,
      method: 'bitcoin',
      walletAddress: 'bc1qexamplewalletaddress'
    });

  assert.equal(withdrawalRes.status, 201);
  assert.equal(withdrawalRes.body.success, true);
  assert.equal(withdrawalRes.body.data.status, 'pending');

  const processRes = await request(app)
    .post('/api/admin/process-withdrawal')
    .send({
      adminUsername: 'kumasi',
      adminPassword: 'admin123',
      userId: registerRes.body.user.id,
      withdrawalId: withdrawalRes.body.data.id,
      status: 'approved'
    });

  assert.equal(processRes.status, 200);
  assert.equal(processRes.body.success, true);
  assert.equal(processRes.body.data.status, 'approved');

  const adminWithdrawals = await request(app)
    .get('/api/admin/withdrawals')
    .query({ adminUsername: 'kumasi', adminPassword: 'admin123' });

  assert.equal(adminWithdrawals.status, 200);
  assert.equal(adminWithdrawals.body.success, true);
  assert.ok(adminWithdrawals.body.data.length >= 1);
});

test('admin notes are saved with withdrawal decisions and returned in dashboard data', async () => {
  const uniqueEmail = `notes.${Date.now()}@example.com`;

  const registerRes = await request(app)
    .post('/api/register')
    .send({
      fullName: 'Akua Nkrumah',
      email: uniqueEmail,
      phone: '+233 20 888 0000',
      password: 'StrongPass1!'
    });

  const fundRes = await request(app)
    .post('/api/admin/fund-user-account')
    .send({
      adminUsername: 'kumasi',
      adminPassword: 'admin123',
      userId: registerRes.body.user.id,
      amount: 1000
    });

  assert.equal(fundRes.status, 200);

  const withdrawalRes = await request(app)
    .post('/api/user/withdrawal-request')
    .send({
      userId: registerRes.body.user.id,
      amount: 200,
      method: 'usdt',
      walletAddress: 'TQf9gk...example'
    });

  const processRes = await request(app)
    .post('/api/admin/process-withdrawal')
    .send({
      adminUsername: 'kumasi',
      adminPassword: 'admin123',
      userId: registerRes.body.user.id,
      withdrawalId: withdrawalRes.body.data.id,
      status: 'approved',
      adminNote: 'Approved after verification.'
    });

  assert.equal(processRes.status, 200);
  assert.equal(processRes.body.success, true);
  assert.match(processRes.body.data.adminNote || '', /verification/i);

  const dashboardRes = await request(app)
    .get('/api/dashboard');

  assert.equal(dashboardRes.status, 200);
  assert.ok(dashboardRes.body.withdrawalRequests.some((item) => item.adminNote && /verification/i.test(item.adminNote)));
});

test('user deposit requests are recorded and admin can edit deposit wallet addresses', async () => {
  const uniqueEmail = `deposit.${Date.now()}@example.com`;

  const registerRes = await request(app)
    .post('/api/register')
    .send({
      fullName: 'Esi Owusu',
      email: uniqueEmail,
      phone: '+233 20 999 0000',
      password: 'StrongPass1!'
    });

  assert.equal(registerRes.status, 201);

  const walletListRes = await request(app)
    .get('/api/admin/deposit-wallets')
    .query({ adminUsername: 'kumasi', adminPassword: 'admin123' });

  assert.equal(walletListRes.status, 200);
  assert.equal(walletListRes.body.success, true);
  assert.ok(walletListRes.body.data.some((entry) => entry.method === 'paypal'));

  const updateRes = await request(app)
    .post('/api/admin/deposit-wallets')
    .send({
      adminUsername: 'kumasi',
      adminPassword: 'admin123',
      method: 'paypal',
      address: 'paypal@kumasiafricablc.com'
    });

  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.success, true);
  assert.equal(updateRes.body.data.address, 'paypal@kumasiafricablc.com');

  const depositRes = await request(app)
    .post('/api/user/deposit-request')
    .send({
      userId: registerRes.body.user.id,
      method: 'paypal',
      amount: 250,
      reference: 'PAY-2026-001'
    });

  assert.equal(depositRes.status, 201);
  assert.equal(depositRes.body.success, true);
  assert.equal(depositRes.body.data.status, 'pending');

  const approvalRes = await request(app)
    .post('/api/admin/process-deposit')
    .send({
      adminUsername: 'kumasi',
      adminPassword: 'admin123',
      userId: registerRes.body.user.id,
      depositId: depositRes.body.data.id,
      status: 'approved'
    });

  assert.equal(approvalRes.status, 200);
  assert.equal(approvalRes.body.success, true);
  assert.equal(approvalRes.body.data.status, 'approved');

  const dashboardRes = await request(app)
    .get('/api/user/dashboard')
    .query({ userId: registerRes.body.user.id });

  assert.equal(dashboardRes.status, 200);
  assert.equal(dashboardRes.body.user.balance, 250);
});
