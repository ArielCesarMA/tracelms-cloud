import express from 'express';
import cors from 'cors';
import path from 'path';
import { settingsRouter } from './routes/settings';
import { parseRouter } from './routes/parse';
import { generateRouter } from './routes/generate';
import { jiraRouter } from './routes/jira';
import { xrayRouter } from './routes/xray';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/settings', settingsRouter);
app.use('/api/parse', parseRouter);
app.use('/api/generate', generateRouter);
app.use('/api/jira', jiraRouter);
app.use('/api/xray', xrayRouter);

// Serve React frontend in production
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`TraceLMs Cloud server running on http://localhost:${PORT}`);
});

export default app;
