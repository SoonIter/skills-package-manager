import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { c } from 'tar'

export function createSkillPackage(skillName: string, content: string, version = '1.0.0'): string {
  const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-package-'))
  mkdirSync(path.join(root, 'skills', skillName), { recursive: true })
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        name: `@tests/${skillName}`,
        version,
      },
      null,
      2,
    ),
  )
  writeFileSync(path.join(root, 'skills', skillName, 'SKILL.md'), content)
  return root
}

export function packDirectory(packageRoot: string): string {
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    name: string
    version: string
  }
  const tarballName = `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`
  const tarballPath = path.join(packageRoot, tarballName)

  rmSync(tarballPath, { force: true })
  c(
    {
      sync: true,
      gzip: true,
      cwd: packageRoot,
      file: tarballPath,
      portable: true,
      prefix: 'package/',
    },
    ['package.json', 'skills'],
  )

  return tarballPath
}

export async function startMockNpmRegistry(
  packageRoot: string,
  options?: { authToken?: string; etag?: string; lastModified?: string },
) {
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    name: string
    version: string
  }
  const tarballPath = packDirectory(packageRoot)
  const tarballBuffer = readFileSync(tarballPath)
  const integrity = `sha512-${createHash('sha512').update(tarballBuffer).digest('base64')}`
  const tarballFileName = path.basename(tarballPath)
  let registryPort = 0
  let metadataRequests = 0
  let metadata200Responses = 0
  let metadata304Responses = 0
  let tarballRequests = 0

  const server = createServer((req, res) => {
    if (options?.authToken && req.headers.authorization !== `Bearer ${options.authToken}`) {
      res.statusCode = 401
      res.end('unauthorized')
      return
    }

    const requestPath = req.url?.split('?')[0] ?? '/'
    const decodedPath = decodeURIComponent(requestPath.slice(1))

    if (decodedPath === manifest.name) {
      metadataRequests += 1
      if (options?.etag && req.headers['if-none-match'] === options.etag) {
        metadata304Responses += 1
        res.statusCode = 304
        res.end()
        return
      }

      metadata200Responses += 1
      res.setHeader('content-type', 'application/json')
      if (options?.etag) {
        res.setHeader('etag', options.etag)
      }
      if (options?.lastModified) {
        res.setHeader('last-modified', options.lastModified)
      }
      res.end(
        JSON.stringify({
          'dist-tags': { latest: manifest.version },
          versions: {
            [manifest.version]: {
              name: manifest.name,
              version: manifest.version,
              dist: {
                tarball: `http://127.0.0.1:${registryPort}/tarballs/${tarballFileName}`,
                integrity,
              },
            },
          },
        }),
      )
      return
    }

    if (requestPath === `/tarballs/${tarballFileName}`) {
      tarballRequests += 1
      res.setHeader('content-type', 'application/octet-stream')
      res.end(tarballBuffer)
      return
    }

    res.statusCode = 404
    res.end('not found')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start mock npm registry')
  }
  registryPort = address.port

  return {
    packageName: manifest.name,
    version: manifest.version,
    registryUrl: `http://127.0.0.1:${registryPort}/`,
    tarballUrl: `http://127.0.0.1:${registryPort}/tarballs/${tarballFileName}`,
    integrity,
    authTokenConfigLine: options?.authToken
      ? `//127.0.0.1:${registryPort}/:_authToken=${options.authToken}`
      : null,
    getRequestCounts: () => ({
      metadataRequests,
      metadata200Responses,
      metadata304Responses,
      tarballRequests,
    }),
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    },
  }
}
