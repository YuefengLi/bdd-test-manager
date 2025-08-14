// backend/start.js
import app from './app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`test-tree api listening on http://localhost:${PORT}`);
});
