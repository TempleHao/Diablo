const $ = id => document.getElementById(id);
const MAX_IMPORT_BYTES = 256 * 1024;

function roleSummary(data) {
  const equipped = data.items.find(item => item.id === data.equipped);
  return `Lv. ${data.level} · ${data.items.length} 件装备 · 已净化 ${data.clears} 次`
    + (equipped ? ` · 装备：${equipped.name}` : ' · 尚未装备法杖');
}

function downloadJSON(content, filename) {
  const url = URL.createObjectURL(new Blob([content], {type: 'application/json;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createSavePanel({manager, getData, onPause, onResume, onApplyData, notify}) {
  const dialog = $('save-dialog');
  const fileInput = $('import-save-file');
  let resumeToken = false;
  let changedCharacter = false;
  let pending = null;
  let readGeneration = 0;
  let opener = null;
  let submitting = false;

  function message(text, error = false) {
    $('save-message').textContent = text;
    $('save-message').dataset.error = String(error);
  }

  function clearPreview() {
    pending = null;
    readGeneration++;
    fileInput.value = '';
    $('import-preview').hidden = true;
    $('confirm-import').disabled = false;
  }

  function refresh() {
    const state = manager.getStatus();
    $('save-summary').textContent = roleSummary(getData());
    $('save-state').textContent = state.message || '本机存档';
    $('recover-save').disabled = !state.hasBackup;
    $('pick-import').disabled = state.canImport === false || (state.canImport == null && !state.canSave);
    $('export-original').textContent = state.hasRejected && state.canSave ? '导出保留原档' : '保存当前原档';
    $('save-mini').textContent = state.canSave ? '本机' : '需处理';
    $('saves').title = state.message || '存档与备份';
    return state;
  }

  function open() {
    if (dialog.open) return;
    opener = document.activeElement;
    resumeToken = onPause();
    changedCharacter = false;
    clearPreview();
    message('');
    refresh();
    dialog.showModal();
  }

  $('saves').addEventListener('click', open);
  $('open-save-intro').addEventListener('click', open);
  $('open-save-result').addEventListener('click', open);
  $('close-save').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    clearPreview();
    onResume(resumeToken, changedCharacter);
    opener?.focus?.();
  });

  $('export-save').addEventListener('click', () => {
    try {
      const data = getData();
      downloadJSON(manager.exportSave(data), `ember-mage-lv${data.level}-${new Date().toISOString().slice(0, 10)}.json`);
      message('已生成当前角色的存档文件，请保存在你能找到的位置。');
    } catch {
      message('当前角色未能导出，请保留此页面并重试。', true);
    }
  });

  $('export-original').addEventListener('click', () => {
    const state = manager.getStatus();
    let result = manager.exportStoredSave(state.hasRejected && state.canSave ? 'rejected' : 'primary');
    // A rejected legacy-only file has no modern primary yet. Preserve the
    // original old file through this same visible recovery entry point.
    if (!result.ok && result.code === 'NO_STORED_SAVE') result = manager.exportStoredSave('legacy');
    if (!result.ok) {
      message(result.message || '本机还没有可导出的原始文件。', true);
      return;
    }
    downloadJSON(result.content, `ember-mage-original-${new Date().toISOString().slice(0, 10)}.json`);
    message('已生成原始存档文件。导出不会修改本机存档。');
  });

  $('pick-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    const generation = ++readGeneration;
    pending = null;
    $('import-preview').hidden = true;
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      message('存档文件不能超过 256 KiB，请选择游戏导出的 JSON 文件。', true);
      fileInput.value = '';
      return;
    }
    message('正在读取存档…');
    try {
      const raw = await file.text();
      if (generation !== readGeneration || !dialog.open) return;
      const preview = manager.previewImport(raw);
      if (!preview.ok) {
        message(preview.message || '这个文件无法导入，本机存档没有变化。', true);
        fileInput.value = '';
        return;
      }
      pending = {kind: 'import', raw};
      $('import-title').textContent = '确认导入这个角色';
      $('import-summary').textContent = roleSummary(preview.data);
      $('import-effect').textContent = '确认后会替换当前角色并回到入场画面。当前角色会保留为恢复点，后续自动保存不会覆盖这个恢复点。';
      $('confirm-import').textContent = '导入并替换';
      $('import-preview').hidden = false;
      message('文件检查通过。尚未替换当前角色。');
    } catch {
      if (generation === readGeneration && dialog.open) {
        message('文件无法读取，请重新选择。本机存档没有变化。', true);
      }
    }
  });

  $('recover-save').addEventListener('click', () => {
    clearPreview();
    const preview = manager.previewBackup();
    if (!preview.ok) {
      message(preview.message || '目前没有可恢复的备份。', true);
      refresh();
      return;
    }
    pending = {kind: 'recover', previewData: JSON.stringify(preview.data), previewSource: preview.source};
    $('import-title').textContent = '确认恢复这个备份';
    $('import-summary').textContent = roleSummary(preview.data);
    $('import-effect').textContent = '确认后会替换当前角色并回到入场画面。被替换的合法角色会保留为恢复点；无法读取的原档也会先保留。';
    $('confirm-import').textContent = '恢复并替换';
    $('import-preview').hidden = false;
    message('请核对备份中的等级和装备。尚未替换当前角色。');
  });

  $('cancel-import').addEventListener('click', () => {
    clearPreview();
    message('已取消，当前角色没有变化。');
  });
  $('confirm-import').addEventListener('click', () => {
    if (!pending || submitting) return;
    const action = pending;
    submitting = true;
    $('confirm-import').disabled = true;
    try {
      if (action.kind === 'recover') {
        const currentPreview = manager.previewBackup();
        if (!currentPreview.ok || JSON.stringify(currentPreview.data) !== action.previewData || currentPreview.source !== action.previewSource) {
          clearPreview();
          message('备份已经变化，请重新预览后再恢复。当前角色没有替换。', true);
          refresh();
          return;
        }
      }
      // Preserve the actual paused character, including progress that could
      // not be saved earlier, rather than only the last persisted snapshot.
      const result = action.kind === 'import' ? manager.importSave(action.raw, getData()) : manager.recoverBackup(getData());
      if (!result.ok) {
        message(result.message || '存档没有替换，请导出当前角色后重试。', true);
        refresh();
        return;
      }
      changedCharacter = true;
      onApplyData(result.data);
      clearPreview();
      refresh();
      dialog.close();
      notify(action.kind === 'import' ? '角色已导入 · 已保留旧角色恢复点' : '备份已恢复 · 已回到入场画面');
    } finally {
      submitting = false;
      $('confirm-import').disabled = false;
    }
  });

  refresh();
  return {open, refresh};
}
