import type { ResolutionData } from './types'

export class Resolution {
  readonly type: ResolutionData['type']
  private readonly data: ResolutionData

  private constructor(data: ResolutionData) {
    this.type = data.type
    this.data = data
  }

  static from(data: ResolutionData): Resolution {
    return new Resolution(data)
  }

  static link(path: string): Resolution {
    return new Resolution({ type: 'link', path })
  }

  static file(tarball: string, path: string): Resolution {
    return new Resolution({ type: 'file', tarball, path })
  }

  static git(url: string, commit: string, path: string): Resolution {
    return new Resolution({ type: 'git', url, commit, path })
  }

  static npm(
    packageName: string,
    version: string,
    path: string,
    tarball: string,
    integrity?: string,
    registry?: string,
  ): Resolution {
    return new Resolution({
      type: 'npm',
      packageName,
      version,
      path,
      tarball,
      integrity,
      registry,
    })
  }

  toJSON(): ResolutionData {
    return { ...this.data }
  }
}
