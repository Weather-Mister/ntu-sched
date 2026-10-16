// Independent of exam display name, date and status. The same imported exam
// keeps its completion checkbox when a student edits its schedule or title.
export function examCompletionKey(item) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.sourceKey === 'string' && item.sourceKey.startsWith('import:'))
    return 'exam:' + item.sourceKey;
  if (item.custom && typeof item.manualRecord?.id === 'string' && item.manualRecord.id)
    return 'exam:custom:' + item.manualRecord.id;
  return null;
}
