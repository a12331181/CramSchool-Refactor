// 備份 MySQL、校務附件及既有頭像，並用 SHA-256 核對還原來源。
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')

const [action, folderArg, database, uploadArg] = process.argv.slice(2)
const loginPath = process.env.CRAMSCHOOL_MYSQL_LOGIN_PATH || 'cramschool'
const uploadRoot = path.resolve(__dirname, '../upload')

function mysql(tool, args, input) {
  const command = tool === 'mysql' ? process.env.MYSQL_BIN || tool : process.env.MYSQLDUMP_BIN || tool
  const result = spawnSync(command, ['--login-path=' + loginPath, ...args], {
    stdio: [input ?? 'ignore', 'pipe', 'inherit'], encoding: 'utf8', windowsHide: true
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw Error(tool + ' 未正常完成。')
  return result.stdout
}

async function inventory(base, sub = '') {
  const rows = []
  for (const name of fs.readdirSync(path.join(base,sub)).sort()) {
    const relative = sub ? sub + '/' + name : name
    if (relative === 'manifest.json') continue
    const file = path.join(base,relative), info = fs.lstatSync(file)
    if (info.isDirectory()) rows.push(...await inventory(base, relative))
    else if (info.isFile()) {
      const hash = createHash('sha256')
      for await (const block of fs.createReadStream(file)) hash.update(block)
      rows.push({ path:relative, bytes:info.size, sha256:hash.digest('hex') })
    } else throw Error('備份包含無法驗證的連結或檔案。')
  }
  return rows
}

async function main() {
  if (!['backup','restore'].includes(action) || !folderArg || !/^[a-zA-Z0-9_]+$/.test(database || '') ||
      (action === 'restore' && !uploadArg)) throw Error('用法：node scripts/school-backup.js backup 備份目錄 資料庫 或 restore 備份目錄 空資料庫 新頭像目錄')
  const base = path.resolve(folderArg), sql = path.join(base,'school.sql'), uploads = path.join(base,'upload')
  if (action === 'backup') {
    const rel = path.relative(uploadRoot,base)
    if (!rel || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel))) throw Error('請將備份存放在上傳目錄以外。')
    fs.mkdirSync(base,{ mode:0o700 })
    mysql('mysqldump',['--single-transaction','--quick','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF','--result-file='+sql,database])
    fs.chmodSync(sql,0o600)
    if (fs.existsSync(uploadRoot)) fs.cpSync(uploadRoot,uploads,{recursive:true})
    else fs.mkdirSync(uploads)
    const files = await inventory(base)
    fs.writeFileSync(path.join(base,'manifest.json'),JSON.stringify({ version:1,files },null,2), {flag:'wx',mode:0o600})
    console.log('備份完成，已記錄 '+files.length+' 個檔案的校驗值。')
    return
  }
  const meta = JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'))
  const destination = path.resolve(uploadArg)
  if (meta.version !== 1 || JSON.stringify(meta.files) !== JSON.stringify(await inventory(base))) throw Error('備份內容與校驗清單不符。')
  if (fs.existsSync(destination)) throw Error('請使用全新的頭像目錄。')
  if (mysql('mysql',['--batch','--skip-column-names',database,'--execute=SHOW TABLES']).trim()) throw Error('請使用已建立的空資料庫。')
  const input = fs.openSync(sql,'r')
  try { mysql('mysql',[database],input) } finally { fs.closeSync(input) }
  fs.cpSync(uploads,destination,{recursive:true,errorOnExist:true,force:false})
  console.log('已還原至 '+database+'，頭像已放入指定目錄。')
}

main().catch(error => { console.error(error.message); process.exitCode=1 })
