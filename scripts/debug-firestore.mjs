import admin from 'firebase-admin'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const KEY = path.join(ROOT, 'daily-stylist-aziz-firebase-adminsdk-fbsvc-7b00216596.json')
const sa = JSON.parse(readFileSync(KEY, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

console.log('Listing top-level collections...')
const top = await db.listCollections()
console.log('Top-level:', top.map(c => c.id))

for (const col of top) {
  const docRefs = await col.listDocuments()
  console.log(`\n[${col.id}] ${docRefs.length} docs (incl. virtual):`)
  for (const ref of docRefs) {
    console.log(`  - ${ref.id}`)
    const subs = await ref.listCollections()
    for (const sub of subs) {
      const cnt = (await sub.count().get()).data().count
      console.log(`      └─ ${sub.id}: ${cnt} docs`)
    }
  }
}
process.exit(0)
