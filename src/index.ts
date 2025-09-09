// app.ts
import { Elysia, t } from 'elysia'
import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60_000,
  // หมายเหตุ: mysql2 ไม่มี option `reconnect` ที่ระดับ pool
})

const app = new Elysia()
  // inject db เข้า context ของทุก handler เป็น `db`
  .decorate('db', pool)

  // global error handler
  .onError(({ code, error, set }) => {
    if (code === 'VALIDATION') {
      set.status = 400
      return { error: 'Bad Request', detail: error.message }
    }
    set.status = 500
    return { error: 'Internal Server Error', detail: error.message }
  })

  // health route
  .get('/', () => ({ message: 'Hello World from Bun (ElysiaJS + MySQL)' }))

  // POST /users  -> create user
  .post(
    '/users',
    async ({ body, db, set }) => {
      const { username, email } = body
      try {
        const [result]: any = await db.query(
          'INSERT INTO users (username, email) VALUES (?, ?)',
          [username, email]
        )
        set.status = 201
        return { message: 'User created successfully', user_id: result.insertId }
      } catch (err: any) {
        set.status = 500
        return { error: 'Database error', detail: err.message }
      }
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1 }),
        email: t.String({ format: 'email' })
      })
    }
  )

  // GET /users/:id -> fetch user by id
  .get(
    '/users/:id',
    async ({ params, db, set }) => {
      try {
        const [rows]: any = await db.query(
          'SELECT user_id, username, email FROM users WHERE user_id = ?',
          [params.id]
        )
        if (!rows || rows.length === 0) {
          set.status = 404
          return { error: 'User not found' }
        }
        const row = rows[0]
        return {
          user_id: Number(row.user_id),
          username: row.username,
          email: row.email
        }
      } catch (err: any) {
        set.status = 500
        return { error: 'Database error', detail: err.message }
      }
    },
    {
      // t.Numeric() จะพยายามแปลง string เป็น number ให้ (หากใช้ Elysia v1+)
      params: t.Object({ id: t.Numeric() })
    }
  )

  .listen(3000)

// graceful shutdown: ปิด pool เมื่อ process ถูก kill
const shutdown = async () => {
  try {
    await pool.end()
  } finally {
    process.exit(0)
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log(`Elysia is running at http://localhost:3000`)
