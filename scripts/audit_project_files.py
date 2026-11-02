"""Inventory and proposed reversible cleanup only. Never reads secret-file contents or moves files."""
import json,pathlib,hashlib,os
ROOT=pathlib.Path(__file__).resolve().parents[1]
PRUNE={'node_modules','.tools','.git','archive','dist','test-results'}
SECRET={'.env','.env.local','.env.production','.env.development'}
SAFE={'.py','.mjs','.cjs','.js','.jsx','.md','.yaml','.yml','.toml','.html','.css','.txt'}
def main():
 files=[]
 for base,ds,names in os.walk(ROOT):
  ds[:]=[n for n in ds if n not in PRUNE]
  for name in names:
   p=pathlib.Path(base)/name; rel=p.relative_to(ROOT).as_posix()
   if name in SECRET or any(t in name.lower() for t in ['secret','private_key','api_key']):category='sensitive_keep_content_not_read'
   elif '__pycache__' in p.parts:category='regenerable_python_cache'
   elif rel=='data/source/电脑数据.xlsx':category='obsolete_excel_snapshot_not_source'
   elif rel.startswith(('frontend/src/','frontend/public/','scripts/','tests/','frontend/tests/','frontend/scripts/','collectors/')) or p.suffix in {'.py','.yaml','.yml'}:category='source_config_tests_keep'
   elif rel.startswith(('data/manual/','data/evidence/','data/raw/','notepick/')):category='historical_evidence_or_course_material_keep'
   elif rel.startswith('data/reference/'):category='reference_inputs_or_generated_provenance_keep'
   elif rel.startswith('data/processed/'):category='generated_report_dependency_or_history_keep'
   else:category='documentation_or_unsure_keep'
   files.append(dict(path=rel,bytes=p.stat().st_size,category=category))
 texts={}
 for f in files:
  p=ROOT/f['path']
  if p.suffix in SAFE and f['category']!='sensitive_keep_content_not_read':
   try:texts[f['path']]=p.read_text('utf-8-sig')
   except UnicodeError:pass
 targets=['__pycache__','collectors/__pycache__','scripts/__pycache__','tests/__pycache__','notepick/scripts/__pycache__','data/source/电脑数据.xlsx']
 entries=[]
 for rel in targets:
  p=ROOT/rel
  if not p.exists():continue
  content=[p] if p.is_file() else sorted(p.rglob('*'))
  hashes={q.relative_to(ROOT).as_posix():hashlib.sha256(q.read_bytes()).hexdigest() for q in content if q.is_file()}
  # Exact path references are distinguished from generic cache documentation and external Excel input.
  refs=[n for n,t in texts.items() if rel in t and n!='scripts/audit_project_files.py']
  executable=[n for n in refs if not n.endswith('.md')]
  entries.append(dict(path=rel,action='archive',destination='archive/2026-10-29-cleanup/'+rel,reason='迁移前已弃用Excel快照；唯一原件在项目外同级data' if p.is_file() else 'Python自动字节码，可从保留源码重建',references=refs,executableReferences=executable,sha256=hashes,recovery='将归档目录中的同路径移回原位置；缓存也可运行Python重建'))
  if executable:raise RuntimeError('发现运行依赖，停止拟归档: '+rel)
 out=dict(scope=str(ROOT),originalInputsOutsideProject=['../data/电脑数据.xlsx','../data/说明文档.md'],archiveRoot='archive/2026-10-29-cleanup',entries=entries,inventory=files,excludedDependencyAndBuildDirectories=sorted(PRUNE),uncertainKeep=['notepick/历史脚本与原始证据：课程交付用途，保留','data/processed/*采集与截图报告：脚本/测试或历史证据使用，保留','data/processed/scoring_cases.json：七组排序回归基线，保留','data/reference/performance_reference.json：本地原文来源层，不是统一最新版副本','frontend/src/data/hardwareKnowledge.json：当前3B兼容运行快照，不是待删除旧数据','frontend/.tools、node_modules、锁文件与部署配置：运行依赖，保留'])
 if (ROOT/'archive/2026-10-29-cleanup').exists():
  (ROOT/'data/processed/file_inventory_after.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n','utf-8')
  print(json.dumps(dict(inventoryFiles=len(files),remainingArchiveCandidates=len(entries)),ensure_ascii=False))
  return
 (ROOT/'data/processed/file_cleanup_plan.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n','utf-8')
 lines=['# 文件整理计划（移动前盘点）','','仅在正式项目内部可逆归档，不永久删除。原始Excel/Markdown位于项目之外，不移动、不修改。','', '|拟归档路径|原因|精确路径引用|恢复|','|---|---|---|---|']
 for e in entries:lines.append('|'+e['path']+'|'+e['reason']+'|'+(', '.join(e['references']) or '无执行引用')+'|'+e['recovery']+'|')
 lines+=['','## 保留与需人工确认','']+['- '+s for s in out['uncertainKeep']]+['','归档前每个文件的SHA256及完整文件分类见同目录file_cleanup_plan.json。此脚本只盘点和写报告，不执行移动。缓存、依赖、构建产物不能等同无用资料。']
 (ROOT/'data/processed/file_cleanup_plan.md').write_text('\n'.join(lines)+'\n','utf-8')
 print(json.dumps(dict(plannedEntries=len(entries),plannedFiles=sum(len(e['sha256']) for e in entries),inventoryFiles=len(files)),ensure_ascii=False))
if __name__=='__main__':main()
