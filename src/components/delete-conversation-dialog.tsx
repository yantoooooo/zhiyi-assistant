"use client";

type Props = {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteConversationDialog({ title, onCancel, onConfirm }: Props) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="history-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="history-delete-title" aria-describedby="history-delete-description">
      <h2 id="history-delete-title">删除历史对话？</h2>
      <p id="history-delete-description">确定删除“{title}”吗？删除后无法恢复。</p>
      <div className="history-delete-actions">
        <button type="button" onClick={onCancel} autoFocus>取消</button>
        <button type="button" className="history-delete-confirm" onClick={onConfirm}>确认删除</button>
      </div>
    </section>
  </div>;
}
