import './index.css';

import { Layout as OriginalLayout } from '@rspress/core/theme-original';
import { Head } from '@rspress/core/runtime';

function SiteFooter() {
  return (
    <div className="spm-footer">
      <div className="spm-footer__inner">
        <div>
          <div className="spm-footer__title">skills-package-manager</div>
          <p className="spm-footer__text">
            A lightweight package manager for discovering, installing, updating,
            and linking AI agent skills.
          </p>
        </div>
        <div className="spm-footer__links">
          <a href="/guide/start/introduction">Documentation</a>
          <a href="/guide/start/getting-started">Quick Start</a>
          <a href="https://github.com/SoonIter/skills-pm">GitHub</a>
        </div>
      </div>
    </div>
  );
}

export function Layout() {
  return (
    <>
      <Head>
        <script>{`document.documentElement.classList.add('dark', 'rp-dark');`}</script>
      </Head>
      <OriginalLayout bottom={<SiteFooter />} />
    </>
  );
}

export * from '@rspress/core/theme-original';
