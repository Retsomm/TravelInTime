import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'

const router = Router()

router.get('/', (req, res) => {
  const { bookId } = req.query
  const notes = bookId
    ? getDb().prepare('SELECT * FROM notes WHERE book_id = ? ORDER BY created_at DESC').all(bookId as string)
    : getDb().prepare('SELECT * FROM notes ORDER BY created_at DESC').all()
  res.json(notes)
})

router.post('/', (req, res) => {
  const { bookId, cfi, text, note, color } = req.body
  const id = uuidv4()
  getDb()
    .prepare('INSERT INTO notes (id, book_id, cfi, text, note, color) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, bookId, cfi, text, note ?? null, color ?? 'yellow')
  res.json({ id, bookId, cfi, text, note, color })
})

router.put('/:id', (req, res) => {
  const { note, color } = req.body
  getDb()
    .prepare('UPDATE notes SET note = ?, color = ? WHERE id = ?')
    .run(note ?? null, color ?? 'yellow', req.params.id)
  res.json({ success: true })
})

router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

export default router
