const express = require('express');
const router = express.Router();
const loginRoutes = require('./login');
const leadRoutes = require('./lead.routes');
const appointmentRoutes = require('./appointment.routes');
const quotationRoutes = require('./quotation.routes');
const projectRoutes = require('./project.routes');
const paymentRoutes = require('./payment.routes');
const userRoutes = require('./users.routes');
const notificationRoutes = require('./notifications.routes');
const purchaseManagerRoutes = require('./purchase-managers.routes');

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
router.use('/auth', loginRoutes);
router.use('/users', userRoutes);
router.use('/leads', leadRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/quotations', quotationRoutes);
router.use('/projects', projectRoutes);
router.use('/payments', paymentRoutes);
router.use('/notifications', notificationRoutes);
// Sales Head manages Purchase Manager accounts (stored in the purchase_managers
// collection). Login/dashboard for those accounts is served by the separate
// Purchase Manager backend — not here.
router.use('/purchase-managers', purchaseManagerRoutes);

module.exports = router;
