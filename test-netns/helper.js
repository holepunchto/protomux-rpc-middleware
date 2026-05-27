const { spawn } = require('child_process')

exports.execFileOnNetns = async (netns, file, args, opts) => {
  return await new Promise((resolve, reject) => {
    const cp = spawn('ip', ['netns', 'exec', netns, process.execPath, file, ...args], opts)
    let stdout = ''
    let stderr = ''

    cp.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    cp.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    cp.on('close', (code) => {
      if (code !== 0) {
        try {
          const parsedError = JSON.parse(stderr)
          reject(parsedError)
        } catch (error) {
          reject(new Error(`Command failed with code ${code}`))
        }
      } else resolve(stdout)
    })
  })
}
