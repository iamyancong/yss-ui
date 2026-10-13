import { ReactComponent as ArrowRightIcon } from '@ant-design/icons-svg/inline-svg/outlined/arrow-right.svg';
import { Link } from 'dumi';
import React, { useState } from 'react';
import { HOME_CREATE_APP_STEP, HOME_QUICKSTART_STEPS } from '../../constants';
import { CopyCommandButton } from './CopyCommandButton';

/** 首页快速接入区：分两条路径（已有项目接入 / 新建微应用）。 */
export const QuickStart = () => {
  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('existing');

  return (
    <section
      className="yss-extras-section yss-extras-quickstart"
      data-extras-section="quickstart"
      aria-labelledby="yss-quickstart-title"
    >
      <header className="yss-extras-head" data-reveal>
        <span className="yss-extras-head__eyebrow">GET STARTED</span>
        <h2 id="yss-quickstart-title">两种路径，快速接入完整交付能力</h2>
        <p>为已有项目分步接入组件库、AI Skills 与 MCP 服务，或通过一键脚手架新建微应用。</p>
        <div
          className="yss-quickstart-tabs"
          style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'center' }}
        >
          <button
            type="button"
            className={`yss-qs-tab-btn ${activeTab === 'existing' ? 'active' : ''}`}
            onClick={() => setActiveTab('existing')}
            style={{
              padding: '6px 16px',
              borderRadius: '20px',
              border: '1px solid var(--yss-workbench-preview-border)',
              background: activeTab === 'existing' ? 'var(--yss-brand-color, #4f7cff)' : 'transparent',
              color: activeTab === 'existing' ? '#fff' : 'inherit',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '13px',
            }}
          >
            📦 已有项目接入 (三条命令)
          </button>
          <button
            type="button"
            className={`yss-qs-tab-btn ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
            style={{
              padding: '6px 16px',
              borderRadius: '20px',
              border: '1px solid var(--yss-workbench-preview-border)',
              background: activeTab === 'new' ? 'var(--yss-brand-color, #4f7cff)' : 'transparent',
              color: activeTab === 'new' ? '#fff' : 'inherit',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '13px',
            }}
          >
            🚀 新建微应用 (一条命令)
          </button>
        </div>
      </header>

      {activeTab === 'new' ? (
        <div className="yss-quickstart-single" style={{ maxWidth: '640px', margin: '0 auto', width: '100%' }}>
          <div
            className="yss-qs-card"
            data-reveal
            style={{ '--feature-accent-rgb': '79 124 255' } as React.CSSProperties}
          >
            <header className="yss-qs-card__head">
              <i>01</i>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0 }}>{HOME_CREATE_APP_STEP.title}</h3>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'rgba(79, 124, 255, 0.15)',
                      color: '#4f7cff',
                    }}
                  >
                    {HOME_CREATE_APP_STEP.badge}
                  </span>
                </div>
                <p style={{ marginTop: '6px' }}>{HOME_CREATE_APP_STEP.detail}</p>
              </div>
            </header>
            <div className="yss-qs-command">
              <code data-command={HOME_CREATE_APP_STEP.command}>{HOME_CREATE_APP_STEP.command}</code>
              <CopyCommandButton command={HOME_CREATE_APP_STEP.command} />
            </div>
            <Link className="yss-extras-link" to={HOME_CREATE_APP_STEP.link}>
              {HOME_CREATE_APP_STEP.linkText}
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : (
        <ol className="yss-quickstart-grid">
          {HOME_QUICKSTART_STEPS.map((step, index) => (
            <li className="yss-qs-card" data-reveal key={step.key}>
              <header className="yss-qs-card__head">
                <i>0{index + 1}</i>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
              </header>
              <div className="yss-qs-command">
                <code data-command={step.command}>{step.command}</code>
                <CopyCommandButton command={step.command} />
              </div>
              <Link className="yss-extras-link" to={step.link}>
                {step.linkText}
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
