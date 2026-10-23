#!/usr/bin/env python3
"""Post-inference evaluator. Never import from recognizer/worker code.

This reads authored truth only AFTER an isolated engine has written result.json.
It cannot make an engine call. Exactness includes rests/timing/parts/clefs/key/
meter/measure counts/ties/repeats, not merely a matching list of MIDI pitches.
"""
import argparse, collections, hashlib, json, math, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent; LAB=ROOT.parent
sys.path.insert(0,str(ROOT/'tooling'))
import defusedxml.ElementTree as ET
PC={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}

def number(value, label, positive=False):
    try:n=float(value)
    except (ValueError,TypeError):raise ValueError('Missing/invalid '+label)
    if not math.isfinite(n) or positive and n<=0:raise ValueError('Invalid '+label)
    return n
def text(node,path,default=None):return node.findtext(path,default)
def same(a,b):return abs(a-b)<1e-6
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read_xml(path):
    data=path.read_bytes()
    if len(data)>10*1024*1024:raise ValueError('Oversized inference output')
    root=ET.fromstring(data,forbid_entities=True,forbid_external=True)
    # MusicXML uses no namespace normally; normalize optional namespaces only.
    for e in root.iter(): e.tag=e.tag.rsplit('}',1)[-1]
    if root.tag!='score-partwise':raise ValueError('Only score-partwise outputs are evaluated')
    parts=[]
    for pi,part in enumerate(root.findall('part')):
        divisions=None;meter=None;key=0;clef=None;offset=0;events=[];measures=[];repeats=[];changes=[];initial=None
        for mi,measure in enumerate(part.findall('measure')):
            cursor=0;maximum=0;previous={}
            for node in measure:
                if node.tag=='attributes':
                    d=text(node,'divisions')
                    if d is not None:divisions=number(d,'divisions',True)
                    if node.find('time') is not None:
                        beats=number(text(node,'time/beats'),'meter beats',True);beatType=number(text(node,'time/beat-type'),'meter beat type',True)
                        meter={'beats':beats,'beatType':beatType}
                    if node.find('key') is not None:key=int(number(text(node,'key/fifths'),'key fifths'))
                    if node.find('clef') is not None:
                        sign=text(node,'clef/sign');line=text(node,'clef/line')
                        clef='treble' if (sign,line)==('G','2') else 'bass' if (sign,line)==('F','4') else str(sign)+str(line)
                    changes.append({'measure':mi+1,'clef':clef,'keyFifths':key,'meter':meter,'hasClef':node.find('clef') is not None,'hasKey':node.find('key') is not None,'hasMeter':node.find('time') is not None})
                elif node.tag in ['backup','forward']:
                    if divisions is None:raise ValueError('Timing without divisions')
                    step=number(text(node,'duration'),'cursor duration',True)/divisions
                    cursor+=step if node.tag=='forward' else -step
                    if cursor < -1e-6:raise ValueError('Backup precedes measure start')
                    maximum=max(maximum,cursor)
                elif node.tag=='note':
                    if initial is None:initial={'clef':clef,'keyFifths':key,'meter':meter}
                    if node.find('grace') is not None:raise ValueError('Grace-note output needs separate unsupported review')
                    if divisions is None:raise ValueError('Notes without divisions')
                    duration=number(text(node,'duration'),'note duration',True)/divisions
                    voice=text(node,'voice','1');staff=text(node,'staff','1');group=(voice,staff)
                    chord=node.find('chord') is not None
                    if chord and group not in previous:raise ValueError('Chord without its preceding onset')
                    onset=previous[group] if chord else cursor
                    rest=node.find('rest') is not None
                    row={'type':'rest' if rest else 'note','measure':mi+1,'onsetBeats':offset+onset,'durationBeats':duration,'voice':voice,'staff':staff}
                    if rest:row['midi']=None;row['pitch']=None
                    else:
                        if node.find('unpitched') is not None:raise ValueError('Unpitched output cannot stand in for original pitched material')
                        step=text(node,'pitch/step');alter=number(text(node,'pitch/alter','0'),'pitch alter');octave=number(text(node,'pitch/octave'),'pitch octave')
                        if step not in PC or not alter.is_integer() or not octave.is_integer():raise ValueError('Unsupported nonintegral/unknown pitch')
                        row['midi']=(int(octave)+1)*12+PC[step]+int(alter)
                        row['pitch']=step+('#'*int(alter) if alter>0 else 'b'*int(-alter))+str(int(octave))
                    ties=sorted(set(e.get('type') for e in node.findall('tie')+node.findall('notations/tied') if e.get('type') in ['start','stop']))
                    if ties:row['ties']=ties
                    events.append(row)
                    if not chord:previous[group]=onset;cursor+=duration
                    maximum=max(maximum,onset+duration,cursor)
                elif node.tag=='barline':
                    repeat=node.find('repeat')
                    if repeat is not None:
                        direction=repeat.get('direction');times=int(repeat.get('times','2')) if direction=='backward' else None
                        repeats.append({'measure':mi+1,'direction':direction,'times':times})
            length=meter['beats']*4/meter['beatType'] if meter else maximum
            measures.append({'number':mi+1,'writtenSpanBeats':maximum,'nominalBeats':length,'underfull':maximum<length-1e-6,'overfull':maximum>length+1e-6})
            offset+=max(length,maximum)
        if not measures:raise ValueError('Output contains an empty part')
        initial=initial or {'clef':None,'keyFifths':key,'meter':meter}
        parts.append({'id':part.get('id','P'+str(pi+1)),**initial,'events':events,'measureCount':len(measures),'measures':measures,'lengthBeats':offset,'repeats':repeats,'attributeChanges':changes})
    if not parts:raise ValueError('No parts in output')
    return {'parts':parts}

def ordered(events):return sorted(events,key=lambda e:(round(e['onsetBeats'],6),e['type'],e['midi'] if e['midi'] is not None else -1,e.get('staff','1'),e.get('voice','1')))
def align(expected,actual):
    # Edit alignment avoids shifting every later comparison after one omission.
    if len(expected)>512 or len(actual)>512:raise ValueError('Result too large for bounded evaluation')
    symbol=lambda e:(e['type'],e['midi'])
    m,n=len(expected),len(actual);cost=[[0]*(n+1) for _ in range(m+1)]
    for i in range(m+1):cost[i][0]=i
    for j in range(n+1):cost[0][j]=j
    for i in range(1,m+1):
        for j in range(1,n+1):cost[i][j]=min(cost[i-1][j-1]+(symbol(expected[i-1])!=symbol(actual[j-1])),cost[i-1][j]+1,cost[i][j-1]+1)
    pairs=[];missing=[];extra=[];i=m;j=n
    while i or j:
        if i and j and cost[i][j]==cost[i-1][j-1]+(symbol(expected[i-1])!=symbol(actual[j-1])):pairs.append((expected[i-1],actual[j-1]));i-=1;j-=1
        elif i and cost[i][j]==cost[i-1][j]+1:missing.append(expected[i-1]);i-=1
        else:extra.append(actual[j-1]);j-=1
    return list(reversed(pairs)),list(reversed(missing)),list(reversed(extra))
def ties(event):return sorted(event.get('ties', [event['tie']] if event.get('tie') else []))
def compare(truth,predicted):
    parts=[];exact=len(truth['parts'])==len(predicted['parts']);metrics=collections.Counter()
    for i,expected in enumerate(truth['parts']):
        actual=predicted['parts'][i] if i<len(predicted['parts']) else {'events':[],'measures':[],'measureCount':0,'clef':None,'keyFifths':None,'meter':None,'repeats':[],'lengthBeats':0}
        target=ordered(expected['events']);got=ordered(actual['events']);pairs,missing,extra=align(target,got)
        count=collections.Counter(expectedNotes=sum(e['type']=='note' for e in target),recognizedNotes=sum(e['type']=='note' for e in got),expectedRests=sum(e['type']=='rest' for e in target),recognizedRests=sum(e['type']=='rest' for e in got),missingEvents=len(missing),extraEvents=len(extra))
        mismatches=[]
        for t,a in pairs:
            pitch=t['type']==a['type'] and t['midi']==a['midi'];onset=same(t['onsetBeats'],a['onsetBeats']);duration=same(t['durationBeats'],a['durationBeats']);tie=ties(t)==ties(a);spelling=t['type']=='rest' or t.get('pitch')==a.get('pitch')
            if t['type']=='note':count['pitchCorrectAligned']+=pitch;count['onsetCorrectAligned']+=onset;count['durationCorrectAligned']+=duration;count['spellingCorrectAligned']+=spelling
            else:count['restCorrectAligned']+=pitch and onset and duration
            if not(pitch and onset and duration and tie and spelling):mismatches.append({'expected':t,'actual':a,'pitch':pitch,'onset':onset,'duration':duration,'tie':tie,'spelling':spelling})
        expectedRepeats=[]
        if truth.get('repeat'):
            r=truth['repeat'];expectedRepeats=[{'measure':r['forwardMeasure'],'direction':'forward','times':None},{'measure':r['backwardMeasure'],'direction':'backward','times':r['times']}]
        checks={'pitchRhythmRestsTiesExact':not(mismatches or missing or extra),'clef':expected['clef']==actual['clef'],'key':expected['keyFifths']==actual['keyFifths'],'meter':expected['meter']==actual['meter'],'measureCount':len(set(e['measure'] for e in target))==actual['measureCount'],'fullMeasureSpans':bool(actual['measures']) and not any(m['underfull'] or m['overfull'] for m in actual['measures']),'totalLength':same(expected['lengthBeats'],actual['lengthBeats']),'repeatMarks':expectedRepeats==actual['repeats']}
        ok=all(checks.values());exact=exact and ok;metrics.update(count)
        parts.append({'index':i,'exact':ok,'checks':checks,'metrics':dict(count),'missing':missing,'extra':extra,'mismatches':mismatches,'recognizedMeasures':actual['measures']})
    for extraPart in predicted['parts'][len(truth['parts']):]:
        metrics.update(recognizedNotes=sum(e['type']=='note' for e in extraPart['events']),recognizedRests=sum(e['type']=='rest' for e in extraPart['events']),extraEvents=len(extraPart['events']))
    return {'exactWrittenScore':exact,'expectedParts':len(truth['parts']),'recognizedParts':len(predicted['parts']),'metrics':dict(metrics),'parts':parts,'sourcePolicyLimitations':truth.get('unsupportedForInitialSingleVoiceModel',[]),'automaticAcceptanceAllowedByThisReport':False}

def evaluate_result(path,reference):
    metadata=json.loads(path.read_text());caseid=path.parent.name
    # Unique-attempt folders may be named independently from their source ID.
    source=Path(metadata.get('input',''));caseid=source.stem or caseid;inputFormat=source.suffix.lower().lstrip('.')
    case=reference.get(caseid);row={'engine':metadata.get('engine'),'id':caseid,'inputFormat':inputFormat,'resultFile':str(path),'seconds':metadata.get('seconds'),'peakRssKiB':metadata.get('peakRssKiB'),'timeout':metadata.get('timeout'),'returncode':metadata.get('returncode'),'truthNotReadDuringInferenceAsserted':metadata.get('truthReadDuringInference') is False}
    if not case:return dict(row,status='unknown-input-case')
    copied=(LAB/metadata['copiedInput']).resolve() if metadata.get('copiedInput') else path.parent/source.name
    if not copied.is_relative_to(LAB):return dict(row,status='unexpected-copied-input-path',exactWrittenScore=False)
    if not copied.exists():return dict(row,status='missing-copied-input',exactWrittenScore=False)
    if inputFormat not in ['png','pdf']:return dict(row,status='unexpected-input-format',exactWrittenScore=False)
    expectedHash=case['pdfSha256'] if inputFormat=='pdf' else case['sha256']
    row['copiedInputSha256']=sha(copied);row['manifestInputSha256']=expectedHash;row['reportedHashMatchesCopy']=metadata.get('inputSha256')==row['copiedInputSha256']
    row['inputMatchesFrozenCorpus']=row['copiedInputSha256']==expectedHash
    if not row['inputMatchesFrozenCorpus']:return dict(row,status='stale-input-corpus-changed',exactWrittenScore=False)
    if metadata.get('timeout') or metadata.get('returncode')!=0:return dict(row,status='engine-timeout' if metadata.get('timeout') else 'engine-error',exactWrittenScore=False)
    outputs=metadata.get('outputs',[])
    if not outputs:return dict(row,status='no-output',exactWrittenScore=False)
    if len(set(outputs))!=1:return dict(row,status='multiple-output-files-require-review',outputs=outputs,exactWrittenScore=False)
    output=(LAB/outputs[0]).resolve()
    if not output.is_relative_to(LAB) or output.suffix.lower() not in ['.xml','.musicxml']:return dict(row,status='unexpected-output-path',exactWrittenScore=False)
    try:
        prediction=read_xml(output);truth=json.loads((ROOT/case['groundTruth']).read_text());assessment=compare(truth,prediction)
        return dict(row,status='evaluated',output=str(output),outputSha256=sha(output),**assessment)
    except Exception as error:return dict(row,status='invalid-or-unsupported-output',error=str(error),exactWrittenScore=False)

def selftest():
    for c in json.loads((ROOT/'manifest.json').read_text())['cases']:
        if c['variant']!='clean':continue
        expected=json.loads((ROOT/c['groundTruth']).read_text());prediction=read_xml(ROOT/c['source']);result=compare(expected,prediction)
        assert result['exactWrittenScore'],(c['id'],result)
    # A single missing note, silent wrong duration, dropped rest, tie, repeat or
    # part must never pass merely because some pitch names happen to match.
    import copy
    c=json.loads((ROOT/'truth/13-treble-tie.json').read_text());p=read_xml(ROOT/'sources/13-treble-tie.musicxml');p['parts'][0]['events'][0]['ties']=[];assert not compare(c,p)['exactWrittenScore']
    c=json.loads((ROOT/'truth/05-treble-rests.json').read_text());p=read_xml(ROOT/'sources/05-treble-rests.musicxml');p['parts'][0]['events']=[e for e in p['parts'][0]['events'] if e['type']!='rest'];assert not compare(c,p)['exactWrittenScore']
    print('PASS20 authored round-trips and dropped-tie/rest rejection probes')

def main():
    global LAB
    parser=argparse.ArgumentParser();parser.add_argument('--lab-root',type=Path,default=LAB,help='Optional external benchmark root; result metadata output paths are relative to this directory.');parser.add_argument('--results',type=Path);parser.add_argument('--output',type=Path,default=Path('engine-evaluation.json'));parser.add_argument('--selftest',action='store_true');args=parser.parse_args()
    LAB=args.lab_root.resolve();args.results=args.results or LAB/'results'
    if args.selftest:selftest()
    manifest=json.loads((ROOT/'manifest.json').read_text());reference={c['id']:c for c in manifest['cases']}
    rows=[dict(evaluate_result(p,reference),resultMtime=p.stat().st_mtime) for p in sorted(args.results.rglob('result.json'))]
    grouped=collections.defaultdict(list)
    for row in rows:grouped[(row.get('engine','unknown'),row['id'],row['inputFormat'])].append(row)
    # Latest current-image attempt, including its failure. Never choose the
    # highest-accuracy retry; every older/stale attempt remains in the report.
    primary=[]
    for group in grouped.values():
        candidates=[r for r in group if r.get('inputMatchesFrozenCorpus')]
        primary.append(max(candidates or group,key=lambda r:r['resultMtime']))
    pdfPrimary=[r for r in primary if r['inputFormat']=='pdf'];primary=[r for r in primary if r['inputFormat']=='png']
    counts=collections.Counter((r.get('engine','unknown'),r['status']) for r in rows);engines={}
    for engine in sorted(set(r.get('engine','unknown') for r in rows)):
        own=[r for r in rows if r.get('engine','unknown')==engine];selected=[r for r in primary if r.get('engine','unknown')==engine];aggregate=collections.Counter()
        for r in selected:aggregate.update(r.get('metrics',{}))
        pdfs=[r for r in pdfPrimary if r.get('engine','unknown')==engine]
        engines[engine]={'attempts':len(own),'uniquePngCases':len(selected),'exactWrittenScorePngCases':sum(r.get('exactWrittenScore',False) for r in selected),'evaluatedCurrentPngCases':sum(r['status']=='evaluated' for r in selected),'pngPrimaryStatuses':dict(collections.Counter(r['status'] for r in selected)),'metricsOnEvaluatedPngCases':dict(aggregate),'pdfSmokeCases':len(pdfs),'pdfExactWrittenScoreCases':sum(r.get('exactWrittenScore',False) for r in pdfs),'allAttemptStatuses':{status:n for (e,status),n in counts.items() if e==engine}}
    report={'schemaVersion':1,'postInferenceOnly':True,'groundTruthReadOnlyAfterInference':True,'frozenManifestSha256':sha(ROOT/'manifest.json'),'engines':engines,'primaryCases':primary,'pdfSmokeCases':pdfPrimary,'attempts':rows,'limits':['Original synthetic engraving plus mild synthetic scan degradation only; no real-world general accuracy claim.','Primary is the latest same-input-hash attempt, including failures; never choose a best retry silently. All older and stale attempts remain recorded.','PNG primary metrics and raster-only PDF smoke metrics are separate; PDF hashes are checked against their own frozen file hashes.','No tempo was printed; tempo is not inferred or scored.','Exact written notation includes spelling, rests, onset, duration, part count, clef, key, meter, full measure spans, ties and repeat marks.','Unsupported-for-initial-model cases remain review-required; this evaluator never authorizes acceptance.','The harness assertion truthReadDuringInference is recorded, not represented as an operating-system access audit.']}
    args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(engines,indent=2))

if __name__=='__main__':main()
