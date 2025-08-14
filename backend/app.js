// backend/app.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import db from './db/index.js';
import nodesRouter from './routes/nodes.js';
import tagsRouter from './routes/tags.js';
import copyRouter from './routes/copy.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
// Mount routers
app.use(nodesRouter);
app.use(tagsRouter);
app.use(copyRouter);

export default app;

// Allow running directly (e.g., when nodemon starts app.js). If this module is
// the entrypoint, start the HTTP server. When imported (e.g., by start.js), we
// simply export the configured Express app without listening here.
if (process.argv[1] && process.argv[1].endsWith('app.js')) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`test-tree api listening on http://localhost:${PORT}`);
  });
}
