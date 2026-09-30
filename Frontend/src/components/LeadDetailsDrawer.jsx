import React, { useState } from 'react';
import { X, Trash2, FileText } from 'lucide-react';

// Human-readable file size, e.g. "2.4 MB".
const fmtBytes = (n) => {
  const b = Number(n) || 0;
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};
import './LeadDetailsDrawer.css';

export default function LeadDetailsDrawer({ isOpen, onClose, lead, initialTab = 'specifications' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen || !lead) return null;

  return (
    <div className="ldd-overlay" onClick={onClose}>
      <div className="ldd-drawer" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="ldd-header">
          <div className="ldd-header-info">
            <h2>Lead Information Details</h2>
            <p className="ldd-subtitle">{lead.id} — {lead.name}</p>
          </div>
          <button className="ldd-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="ldd-tabs">
          <button 
            className={`ldd-tab ${activeTab === 'specifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('specifications')}
          >
            Lead Specifications
          </button>
          <button 
            className={`ldd-tab ${activeTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            Activity Timeline (2)
          </button>
        </div>

        {/* Content */}
        <div className="ldd-content">
          {activeTab === 'specifications' ? (
            <div className="ldd-specs-container">
              
              <div className="ldd-card">
                <h3 className="ldd-card-title">Basic Information</h3>
                <div className="ldd-grid-2">
                  <div className="ldd-field">
                    <label>CUSTOMER NAME</label>
                    <div>{lead.name}</div>
                  </div>
                  <div className="ldd-field">
                    <label>COMPANY NAME</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>PHONE NUMBER</label>
                    <div>{lead.phone}</div>
                  </div>
                  <div className="ldd-field">
                    <label>EMAIL ADDRESS</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>SERVICE SEGMENT</label>
                    <div><span className="ldd-chip blue">{lead.services}</span></div>
                  </div>
                  <div className="ldd-field">
                    <label>LEAD SOURCE</label>
                    <div>{lead.source}</div>
                  </div>
                  <div className="ldd-field">
                    <label>ASSIGNED MANAGER</label>
                    <div>{lead.assignTo}</div>
                  </div>
                  <div className="ldd-field">
                    <label>PROJECT LOCATION</label>
                    <div>{lead.location}</div>
                  </div>
                  <div className="ldd-field">
                    <label>PRIORITY LEVEL</label>
                    <div><span className="ldd-chip yellow">Medium</span></div>
                  </div>
                  <div className="ldd-field">
                    <label>CURRENT STATUS</label>
                    <div><span className="ldd-chip gray">Warm</span></div>
                  </div>
                </div>
              </div>

              <div className="ldd-card">
                <h3 className="ldd-card-title">PEB Building Details</h3>
                <div className="ldd-grid-2">
                  <div className="ldd-field">
                    <label>PROJECT TYPE</label>
                    <div>Warehouse</div>
                  </div>
                  <div className="ldd-field">
                    <label>STRUCTURE TYPE</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>SITE CONDITION</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>SOIL TEST REPORT</label>
                    <div>Not Done</div>
                  </div>
                </div>
              </div>

              <div className="ldd-card">
                <h3 className="ldd-card-title">Site Dimensions</h3>
                <div className="ldd-grid-2">
                  <div className="ldd-field">
                    <label>LENGTH</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>WIDTH</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>RIDGE HEIGHT</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>CLEAR HEIGHT</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>TOTAL SITE AREA</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>BAY SPACING</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>NO OF FLOORS</label>
                    <div>1</div>
                  </div>
                  <div className="ldd-field">
                    <label>MEZZANINE AREA</label>
                    <div>-</div>
                  </div>
                </div>
              </div>

              <div className="ldd-card">
                <h3 className="ldd-card-title">Technical & Scope</h3>
                <div className="ldd-grid-2">
                  <div className="ldd-field">
                    <label>ROOF COVERING</label>
                    <div>GI</div>
                  </div>
                  <div className="ldd-field">
                    <label>CLADDING MATERIAL</label>
                    <div>GI</div>
                  </div>
                  <div className="ldd-field">
                    <label>FLOORING TYPE</label>
                    <div>Normal</div>
                  </div>
                  <div className="ldd-field">
                    <label>SCOPE OF WORK</label>
                    <div>Steel Only</div>
                  </div>
                  <div className="ldd-field">
                    <label>CRANE REQUIREMENT</label>
                    <div>No</div>
                  </div>
                  <div className="ldd-field">
                    <label>INSULATION REQUIRED</label>
                    <div>No</div>
                  </div>
                </div>
              </div>

              <div className="ldd-card">
                <h3 className="ldd-card-title">Commercial Terms</h3>
                <div className="ldd-grid-2">
                  <div className="ldd-field">
                    <label>ESTIMATED REVENUE</label>
                    <div className="ldd-revenue">₹ -</div>
                  </div>
                  <div className="ldd-field">
                    <label>SALES PROBABILITY</label>
                    <div>- %</div>
                  </div>
                  <div className="ldd-field">
                    <label>EXPECTED CLOSING DATE</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>EXPECTED TIMELINE</label>
                    <div>-</div>
                  </div>
                  <div className="ldd-field">
                    <label>NEXT FOLLOW-UP</label>
                    <div>-</div>
                  </div>
                </div>
              </div>

              <div className="ldd-card">
                <h3 className="ldd-card-title">Attached Files</h3>
                {Array.isArray(lead?.attachments) && lead.attachments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {lead.attachments.map((f, i) => (
                      <a
                        key={f.publicId || f.url || i}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.65rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', textDecoration: 'none' }}
                        title={`Open ${f.name}`}
                      >
                        <FileText size={16} color="#6366f1" style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1e293b', fontSize: '0.85rem', fontWeight: 600 }}>{f.name || 'File'}</span>
                        {fmtBytes(f.size) && <span style={{ fontSize: '0.72rem', color: '#94a3b8', flexShrink: 0 }}>{fmtBytes(f.size)}</span>}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="ldd-empty-text">No files attached to this lead</p>
                )}
              </div>
              
            </div>
          ) : (
            <div className="ldd-timeline-container">
              <div className="ldd-timeline-item">
                <div className="ldd-timeline-icon yellow">
                  <div className="ldd-icon-inner"></div>
                </div>
                <div className="ldd-timeline-card">
                  <div className="ldd-timeline-date">18/07/2026, 16:34:26</div>
                  <div className="ldd-timeline-action">Updated status to: WARM</div>
                  <div className="ldd-timeline-remark">
                    <span>Remark:</span> "23ertrewq"
                  </div>
                </div>
              </div>

              <div className="ldd-timeline-item">
                <div className="ldd-timeline-icon gray">
                  <Trash2 size={12} />
                </div>
                <div className="ldd-timeline-card">
                  <div className="ldd-timeline-date">18/07/2026, 16:34:21</div>
                  <div className="ldd-timeline-action">Updated status to: JUNK</div>
                  <div className="ldd-timeline-remark">
                    <span>Remark:</span> "34tr32"
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
