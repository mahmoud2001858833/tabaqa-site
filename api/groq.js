// Vercel function. vercel.json sends /api/groq/<path> here. Add GROQ_API_KEY in the project's Environment Variables.
import { handleGroq } from '../proxy-core.js';

export default function handler(req, res) {
  const p = req.query?.path;
  return handleGroq(req, res, Array.isArray(p) ? p.join('/') : String(p || ''));
}
