#!/usr/bin/env python3
"""Original OMR images. Composition truth is authored before engraving/inference.

No existing song, score, private file, or recognizer output enters this corpus.
The recognizer must only receive files in images/; truth/ and sources/ are for
post-inference evaluation and reproducibility, never recognition input.
"""
import hashlib, io, json, math, os, random, sys
from pathlib import Path
from xml.sax.saxutils import escape
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'tooling'))
import verovio
import fitz
import cairosvg
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

for name in ['images', 'sources', 'truth', 'rendered', 'licenses']:
    (ROOT/name).mkdir(exist_ok=True)

def note(pitch, duration=1, **kwargs):
    return dict(type='note', pitch=pitch, duration=duration, **kwargs)
def rest(duration=1):
    return dict(type='rest', duration=duration)
def chord(pitches, duration):
    return [note(p, duration, chord=i>0) for i,p in enumerate(pitches)]
def part(clef, measures, **kwargs):
    return dict(clef=clef, measures=measures, **kwargs)
def case(id, label, tags, parts, **kwargs):
    return dict(id=id, label=label, tags=tags, parts=parts, **kwargs)

# All melodies/harmonies below were composed solely for this task.
CASES = [
 case('01-treble-quarters','Treble: four stepwise quarters',['treble','quarter','single-melody'],[part('treble',[[note('C4'),note('D4'),note('E4'),note('F4')]])]),
 case('02-treble-rhythm','Treble: quarter, two eighths and half',['treble','quarter','eighth','half'],[part('treble',[[note('C4'),note('E4',.5),note('G4',.5),note('A4',2)]])]),
 case('03-bass-quarters','Bass: four stepwise quarters',['bass','quarter','single-melody'],[part('bass',[[note('C3'),note('D3'),note('E3'),note('F3')]])]),
 case('04-bass-rhythm','Bass: half and two quarters',['bass','half','quarter'],[part('bass',[[note('C3',2),note('G2'),note('A2')]])]),
 case('05-treble-rests','Treble: quarter and half rests, whole note',['treble','rest','half','whole'],[part('treble',[[rest(),note('D4'),rest(2)],[note('G4',4)]])]),
 case('06-bass-rests','Bass: half rest and quarter rest',['bass','rest','half'],[part('bass',[[rest(2),note('F2'),rest()],[note('C3',2),note('B2'),note('A2')]])]),
 case('07-treble-eighths','Treble: beamed scalar eighths',['treble','eighth','beam'],[part('treble',[[note(p,.5,beam='begin' if i%4==0 else 'end' if i%4==3 else 'continue') for i,p in enumerate(['C4','D4','E4','F4','G4','A4','B4','C5'])]])]),
 case('08-treble-dotted','Treble: dotted quarter and eighth',['treble','dotted','eighth'],[part('treble',[[note('C4',1.5),note('E4',.5),note('F4'),note('G4')]])]),
 case('09-treble-accidentals','Treble: explicit sharps, flats and naturals',['treble','accidental','natural'],[part('treble',[[note('F#4',accidental='sharp'),note('F4',accidental='natural'),note('Bb4',accidental='flat'),note('B4',accidental='natural')]])]),
 case('10-treble-key-d','Treble: two-sharp key signature',['treble','key-signature','sharp'],[part('treble',[[note('F#4'),note('G4'),note('A4'),note('C#5')]],fifths=2)]),
 case('11-bass-key-eb','Bass: three-flat key signature',['bass','key-signature','flat'],[part('bass',[[note('Eb3'),note('F3'),note('G3'),note('Ab3')]],fifths=-3)]),
 case('12-treble-chords','Treble: two block triads',['treble','chord','polyphonic-onsets'],[part('treble',[chord(['C4','E4','G4'],2)+chord(['F4','A4','C5'],2)])], unsupported=['single-voice-model-chords']),
 case('13-treble-tie','Treble: tied half plus quarter',['treble','tie','duration'],[part('treble',[[note('E4',2,tie='start'),note('E4',1,tie='stop'),note('G4')]])]),
 case('14-repeat-bars','Treble: two measures enclosed by repeat',['treble','repeat','unsupported-structure'],[part('treble',[[note('C4'),note('E4'),note('G4'),note('E4')],[note('D4',2),note('C4',2)]])],repeat=True,unsupported=['repeat-playback-expansion']),
 case('15-two-parts','Two simultaneous independent treble/bass parts',['treble','bass','multipart','unsupported-structure'],[part('treble',[[note('E4'),note('F4'),note('G4',2)]]),part('bass',[[note('C3',2),note('G2',2)]])],unsupported=['multipart-selection-required']),
 case('16-treble-triplet','Treble: eighth-note triplet and three quarters',['treble','tuplet','unsupported-structure'],[part('treble',[[note('C4',1/3,tuplet='start'),note('D4',1/3,tuplet='continue'),note('E4',1/3,tuplet='stop'),note('F4'),note('G4'),note('A4')]])],unsupported=['tuplet-rhythm']),
]

# Fair printable-page additions: authored multi-measure compositions, not an
# enlarged copy of a tiny line. Keep the short-line cases as separate tests.
CASES += [
 case('17-page-treble-quarters','Eight-measure treble page',['treble','quarter','page-layout'],[part('treble',[[note(p) for p in pitches] for pitches in [['C4','D4','E4','F4'],['G4','F4','E4','D4'],['E4','G4','A4','G4'],['F4','E4','D4','C4'],['D4','E4','F4','A4'],['G4','E4','D4','F4'],['E4','F4','G4','D4'],['C4','E4','D4','C4']]])],pageLayout=True),
 case('18-page-bass-quarters','Eight-measure bass page',['bass','quarter','page-layout'],[part('bass',[[note(p) for p in pitches] for pitches in [['C3','D3','E3','F3'],['G3','F3','E3','D3'],['C3','B2','A2','G2'],['F2','A2','C3','B2'],['A2','C3','D3','E3'],['F3','D3','C3','A2'],['G2','B2','D3','B2'],['C3','G2','E2','C3']]])],pageLayout=True),
 case('19-page-treble-rhythm','Eight-measure treble rhythm page',['treble','half','whole','eighth','dotted','rest','page-layout'],[part('treble',[[note('C4',2),note('E4'),note('G4')],[rest(),note('F4'),note('E4',2)],[note('D4',1.5),note('E4',.5),note('F4'),note('A4')],[note('G4',4)],[note('E4'),note('G4',.5),note('F4',.5),note('D4',2)],[rest(2),note('C4'),note('D4')],[note('E4',2),note('F4',2)],[note('G4'),note('E4'),note('C4',2)]])],pageLayout=True),
 case('20-page-bass-key-eb','Eight-measure bass flat-key page',['bass','flat','key-signature','half','page-layout'],[part('bass',[[note('Eb3'),note('F3'),note('G3'),note('Ab3')],[note('Bb2',2),note('Eb3',2)],[note('Ab2'),note('Bb2'),note('C3'),note('D3')],[note('Eb3',4)],[note('G2'),note('Bb2'),note('Eb3'),note('F3')],[note('G3',2),note('F3'),note('Eb3')],[note('D3'),note('C3'),note('Bb2'),note('Ab2')],[note('Bb2',2),note('Eb3',2)]],fifths=-3)],pageLayout=True),
]

PC={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
def pitch(spelling):
    step=spelling[0]; alter=1 if '#' in spelling else -1 if 'b' in spelling else 0
    octave=int(spelling[-1]); return step,alter,octave,(octave+1)*12+PC[step]+alter
def xml_note(event):
    d=event['duration']; ticks=round(d*12)
    if event.get('tuplet'): typ,dots='eighth',0
    else: typ,dots={4:('whole',0),2:('half',0),1.5:('quarter',1),1:('quarter',0),.5:('eighth',0)}[d]
    content='<chord/>' if event.get('chord') else ''
    if event['type']=='rest':content+='<rest/>'
    else:
        step,alter,octave,midi=pitch(event['pitch'])
        content+='<pitch><step>'+step+'</step><alter>'+str(alter)+'</alter><octave>'+str(octave)+'</octave></pitch>'
    content+='<duration>'+str(ticks)+'</duration><voice>1</voice><type>'+typ+'</type>'+('<dot/>'*dots)
    if event.get('accidental'): content+='<accidental>'+event['accidental']+'</accidental>'
    if event.get('tie'): content+='<tie type="'+event['tie']+'"/>'
    if event.get('tuplet'):content+='<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes><normal-type>eighth</normal-type></time-modification>'
    if event.get('beam'):content+='<beam number="1">'+event['beam']+'</beam>'
    notation=[]
    if event.get('tie'):notation.append('<tied type="'+event['tie']+'"/>')
    if event.get('tuplet') in ['start','stop']:notation.append('<tuplet type="'+event['tuplet']+'" number="1" bracket="yes"/>')
    if notation:content+='<notations>'+''.join(notation)+'</notations>'
    return '<note>'+content+'</note>'
def musicxml(spec):
    listing=''.join('<score-part id="P%d"><part-name></part-name><part-abbreviation></part-abbreviation></score-part>'%(i+1) for i in range(len(spec['parts'])))
    body=[]
    for i,p in enumerate(spec['parts']):
        measures=[]
        for mi,events in enumerate(p['measures']):
            attrs=''
            if mi==0:
                sign,line=('G',2) if p['clef']=='treble' else ('F',4)
                attrs='<attributes><divisions>12</divisions><key><fifths>'+str(p.get('fifths',0))+'</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>'+sign+'</sign><line>'+str(line)+'</line></clef></attributes>'
            left='<barline location="left"><repeat direction="forward"/></barline>' if spec.get('repeat') and mi==0 else ''
            right='<barline location="right"><repeat direction="backward" times="2"/></barline>' if spec.get('repeat') and mi==len(p['measures'])-1 else ''
            measures.append('<measure number="%d">%s%s%s%s</measure>'%(mi+1,attrs,left,''.join(map(xml_note,events)),right))
        body.append('<part id="P%d">%s</part>'%(i+1,''.join(measures)))
    return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list>'+listing+'</part-list>'+''.join(body)+'</score-partwise>'
def truth(spec):
    parts=[]
    for pi,p in enumerate(spec['parts']):
        events=[]; playback=[]
        for mi,measure in enumerate(p['measures']):
            beat=mi*4; previous=beat
            for event in measure:
                onset=previous if event.get('chord') else beat
                row=dict(event,partId='P'+str(pi+1),measure=mi+1,onsetBeats=onset,durationBeats=event['duration'])
                row.pop('duration');row.pop('chord',None)
                if event['type']=='note':row['midi']=pitch(event['pitch'])[3]
                else:row['midi']=None
                events.append(row)
                if event['type']=='note':
                    if event.get('tie')=='stop':
                        tied=next((n for n in reversed(playback) if n['midi']==row['midi'] and math.isclose(n['onsetBeats']+n['durationBeats'],onset)),None)
                        if tied:tied['durationBeats']+=row['durationBeats']
                        else:raise AssertionError('Original tie has no preceding same-pitch duration')
                    else:playback.append({k:row[k] for k in ['midi','pitch','onsetBeats','durationBeats']})
                if not event.get('chord'):previous=beat;beat+=event['duration']
            assert math.isclose(beat,(mi+1)*4), (spec['id'],mi,beat)
        parts.append(dict(id='P'+str(pi+1),clef=p['clef'],keyFifths=p.get('fifths',0),meter={'beats':4,'beatType':4},events=events,playback=playback,lengthBeats=len(p['measures'])*4))
    return dict(schemaVersion=1,id=spec['id'],originalComposition=True,truthOrigin='authored-composition-events-before-rendering',label=spec['label'],tags=spec['tags'],parts=parts,repeat={'forwardMeasure':1,'backwardMeasure':len(spec['parts'][0]['measures']),'times':2} if spec.get('repeat') else None,repeatExpanded=False,tempoVisible=False,tempoBpm=None,unsupportedForInitialSingleVoiceModel=spec.get('unsupported',[]),acceptance='review-required-unsupported' if spec.get('unsupported') else 'candidate-for-human-review')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def degrade(image, seed):
    image=image.convert('L').rotate(.65,resample=Image.Resampling.BICUBIC,expand=True,fillcolor=255)
    image=ImageEnhance.Contrast(image).enhance(.86).filter(ImageFilter.GaussianBlur(.28))
    rng=np.random.default_rng(seed); data=np.asarray(image,dtype=float)
    data=np.clip(data+rng.normal(0,2.0,data.shape)-2,0,255).astype('uint8')
    image=Image.fromarray(data); buffer=io.BytesIO();image.save(buffer,format='JPEG',quality=73);buffer.seek(0)
    return Image.open(buffer).convert('L')
def render(spec):
    xml=musicxml(spec); (ROOT/'sources'/f"{spec['id']}.musicxml").write_text(xml)
    expected=truth(spec); (ROOT/'truth'/f"{spec['id']}.json").write_text(json.dumps(expected,indent=2)+'\n')
    toolkit=verovio.toolkit();toolkit.setOptions({'pageWidth':1800,'pageHeight':2400,'adjustPageHeight':True,'adjustPageWidth':False,'breaks':'auto' if spec.get('pageLayout') else 'none','minLastJustification':0 if spec.get('pageLayout') else .8,'scale':100,'unit':10,'header':'none','footer':'none','pageMarginTop':30,'pageMarginBottom':30,'pageMarginLeft':30,'pageMarginRight':30,'spacingLinear':.8,'spacingNonLinear':.35,'svgRemoveXlink':True})
    if not toolkit.loadData(xml):raise RuntimeError('Engraving failed '+spec['id'])
    assert toolkit.getPageCount()==1
    svg=toolkit.renderToSVG(1); svgPath=ROOT/'rendered'/f"{spec['id']}.svg";svgPath.write_text(svg)
    # Cairo renders nested SVG viewBoxes/use glyph paths at native CSS pixels.
    # Preserve the engraving's native 20px staff spacing; do not enlarge a short
    # line to a full page or leak source markup to a recognizer.
    rendered=cairosvg.svg2png(bytestring=svg.encode(),background_color='white')
    image=Image.open(io.BytesIO(rendered)).convert('RGB')
    assert np.asarray(image).min()<32, 'Refuse a blank/unrendered score raster'
    variants=[]
    for variant,pixels in [('clean',image),('scan',degrade(image,20261023+int(spec['id'][:2])))]:
        path=ROOT/'images'/f"{spec['id']}-{variant}.png";pixels.save(path)
        # Raster-only PDF has one image and no text/score metadata channel.
        pdfPath=ROOT/'images'/f"{spec['id']}-{variant}.pdf";pixels.convert('RGB').save(pdfPath,'PDF',resolution=96.0)
        variants.append(dict(id=spec['id']+'-'+variant,compositionId=spec['id'],variant=variant,image=str(path.relative_to(ROOT)),pdf=str(pdfPath.relative_to(ROOT)),groundTruth='truth/'+spec['id']+'.json',source='sources/'+spec['id']+'.musicxml',svg='rendered/'+spec['id']+'.svg',width=pixels.width,height=pixels.height,sha256=sha(path),pdfSha256=sha(pdfPath),tags=spec['tags'],unsupported=spec.get('unsupported',[]),degradation=None if variant=='clean' else {'rotationDegrees':.65,'contrast':.86,'blurSigmaPixels':.28,'noiseSigma':2.0,'jpegQuality':73,'seed':20261023+int(spec['id'][:2])}))
    return variants

def main():
    selected=CASES[:4] if '--first-four' in sys.argv else CASES
    manifest=dict(schemaVersion=1,name='SoundLab original engraving OMR corpus',license='CC0-1.0 original composition and generator; third-party engraving tooling separately licensed',generator='Verovio '+verovio.toolkit().getVersion(),renderer='CairoSVG native CSS pixels, Pillow controlled degradation',imageOnlyRule='Recognizer receives images/*.png or raster-only images/*.pdf ONLY. Never pass sources/, rendered SVG, truth/, or this manifest with truth to the inference engine.',limits='Synthetic engraving and mild synthetic degradation; no real scanner, camera or handwritten-music claims. Does not establish general accuracy.',compositions=len(selected),cases=[])
    for spec in selected:
        manifest['cases'].extend(render(spec));(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(spec['id'],flush=True)
    images=[{k:c[k] for k in ['id','image','pdf','width','height','sha256']} for c in manifest['cases']]
    (ROOT/'images-only.json').write_text(json.dumps({'schemaVersion':1,'cases':images},indent=2)+'\n')

if __name__=='__main__':main()
