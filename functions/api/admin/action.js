import { json, error, readJson } from '../../../src/lib/http.js';
import { requireAdmin } from '../../../src/lib/admin.js';
import { normalizeText, validateSubmission } from '../../../src/lib/text.js';

const ACTIONS = new Set(['approve', 'reject', 'hide', 'unhide', 'update']);

export async function onRequestPost({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const id = Number(body.id);
  const action = typeof body.action === 'string' ? body.action : '';

  if (!Number.isInteger(id) || id <= 0) return error('Unknown statement.');
  if (!ACTIONS.has(action)) return error('Unknown action.');

  const existing = await env.DB.prepare('SELECT id FROM statements WHERE id = ?').bind(id).first();
  if (!existing) return error('That statement no longer exists.', 404);

  // Rejecting removes the statement outright, along with any votes it had.
  if (action === 'reject') {
    await env.DB.prepare('DELETE FROM votes WHERE statement_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM statements WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  // "Edit then approve" is the same call with new text attached.
  const wantsEdit = typeof body.text === 'string' || typeof body.sourceNote === 'string';
  if (action === 'update' || (action === 'approve' && wantsEdit)) {
    const check = validateSubmission({ text: body.text, sourceNote: body.sourceNote });
    if (!check.ok) return error(check.error);

    const clash = await env.DB.prepare('SELECT id FROM statements WHERE norm_text = ? AND id != ?')
      .bind(normalizeText(check.value.text), id)
      .first();
    if (clash) return error('Another statement already says that.', 409);

    await env.DB.prepare('UPDATE statements SET text = ?, norm_text = ?, source_note = ? WHERE id = ?')
      .bind(check.value.text, check.value.normText, check.value.sourceNote, id)
      .run();

    if (action === 'update') return json({ ok: true });
  }

  const status = action === 'hide' ? 'hidden' : 'approved';
  await env.DB.prepare('UPDATE statements SET status = ? WHERE id = ?').bind(status, id).run();
  return json({ ok: true });
}
