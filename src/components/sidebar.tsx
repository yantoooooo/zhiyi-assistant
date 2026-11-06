import { Clock3, Compass, MessageSquarePlus, Search, Sparkles } from "lucide-react";

const history = ["英国 VAT 注册流程", "欧洲商标怎么申请", "跨境电商税务咨询"];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="brand" href="#top" aria-label="智蚁首页">
        <span className="brand-mark"><Sparkles size={19} strokeWidth={2.2} /></span>
        <span className="brand-name">智蚁<span>AI SERVICE</span></span>
      </a>
      <button className="new-chat"><MessageSquarePlus size={17} /> 新对话</button>
      <button className="nav-link"><Search size={17} /> 搜索</button>
      <button className="nav-link"><Compass size={17} /> 服务技能 <span className="nav-hint">探索</span></button>
      <div className="history-heading"><span>历史对话</span><Clock3 size={14} /></div>
      <div className="history-list">{history.map((item, index) => <button className={`history-item ${index === 0 ? "active" : ""}`} key={item}><span className="history-dot" />{item}</button>)}</div>
      <div className="sidebar-bottom">
        <a className="help-card" href="https://work.weixin.qq.com/ca/cawcde1a9ca59467e6" target="_blank" rel="noopener noreferrer"><span className="help-icon">?</span><div><strong>需要帮助？</strong><small>联系专属服务顾问</small></div></a>
        <div className="profile"><span className="avatar">访</span><span><strong>访客</strong><small>未关联官网账号</small></span></div>
      </div>
    </aside>
  );
}
