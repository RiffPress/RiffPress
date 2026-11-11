"""A demo track's chord chart and melody, lined up with its recording from a public-domain score.

The score is <album>/<track>.score.json: a hymnal's tune and harmony, half bar by half bar, and the
words. This lines it up with the recording album.js builds, by measuring the recording rather than
by ear, then checks the result against the recording and writes it to <album>/lyrics.json, which
album.js merges into manifest.json, and into manifest.json itself:

  chords  ChordPro with LRC times, for Riff Chords' Chords field
  melody  UltraStar, for Riff Sing's Melody field
  score_* where the score comes from and on what terms, beside the recording's own credits

and the first lyric_lines of the track's timed lyrics are moved to where the chart's lines start.

How the times are found:
  1. Chroma (how loud each of the twelve pitch classes is, every 23 ms) of the recording, and of the
     score: each note's pitch class, with its chord under it.
  2. Dynamic time warping between the two, with the path's slope kept near the score's tempo, so a
     held note costs something and the tempo can't jump.
  3. Each note's start moved to the nearest onset the recording has within 150 ms; then, where the
     pitch changes, to the moment within 400 ms that the recording's chroma turns from the one note's
     pitch class to the next's.

How they are checked, and the run fails if either falls short:
  - over each note, where its pitch class ranks among the twelve in the recording (a choir sings
    the tune with three other parts round it, so the tune's note is often second or third; by chance
    it would be in the top three a quarter of the time); at least 70% must be in the top three.
  - over each half bar, the chord that best fits the recording, of the key's diatonic and secondary
    chords: the score's chord (or the same chord with a seventh) must be first or second in at
    least 90% of them.

Needs Python 3 with librosa (pip install librosa), and the album's audio, built by
`npm run albums <album>` into <album>/audio/:

  python3 packages/fixtures/chart.py christmas-with-the-chorus silent-night [--dry-run]
"""
import json
import os
import sys

import numpy as np
import librosa
import scipy.ndimage

NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
QUALITY = {'': (0, 4, 7), 'm': (0, 3, 7), '7': (0, 4, 7, 10), 'maj7': (0, 4, 7, 11)}
SR, HOP = 22050, 512
# UltraStar's BPM counts quarter beats; at 1500, a beat is 10 ms, so a time is written to the 10 ms.
BPM, BEAT = 1500, 0.01


def parse_chord(name):
    root = name[:2] if len(name) > 1 and name[1] in '#b' else name[:1]
    return NAMES.index(root), name[len(root):]


def chord_vector(name, bass=0.5):
    root, q = parse_chord(name)
    v = np.zeros(12)
    for i in QUALITY[q]:
        v[(root + i) % 12] = 1
    v[root] += bass
    return v / np.linalg.norm(v)


def stamp(t):
    cs = int(round(t * 100))  # Rounded once, so 59.996 is [01:00.00], never [00:60.00].
    return '[%02d:%02d.%02d]' % (cs // 6000, cs // 100 % 60, cs % 100)


def load(album, track):
    here = os.path.dirname(os.path.abspath(__file__))
    folder = os.path.join(here, album)
    score = json.load(open(os.path.join(folder, track + '.score.json'), encoding='utf-8'))
    manifest = json.load(open(os.path.join(folder, 'manifest.json'), encoding='utf-8'))
    entry = next(t for t in manifest['tracks'] if t['id'] == track)
    return folder, score, manifest, entry


def notes_of(score):
    words = score['verse'].split()
    notes = []
    for mi, m in enumerate(score['measures']):
        for pitch, units in m['notes']:
            notes.append({'midi': pitch, 'units': units, 'measure': mi + 1, 'chord': m['chord'],
                          'text': words[len(notes)]})
    if len(notes) != len(words):
        sys.exit('The verse has %d syllables for %d notes.' % (len(words), len(notes)))
    return notes


def align(y, notes, rec):
    tuning = librosa.estimate_tuning(y=y, sr=SR)
    chroma = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=HOP, tuning=tuning)
    chroma = scipy.ndimage.median_filter(chroma, size=(1, 9))
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0][: chroma.shape[1]]
    quiet = rms < 0.1 * np.percentile(rms, 90)
    unit = chroma / (np.linalg.norm(chroma, axis=0, keepdims=True) + 1e-9)
    times = librosa.frames_to_time(np.arange(chroma.shape[1]), sr=SR, hop_length=HOP)
    onsets = librosa.onset.onset_detect(y=y, sr=SR, hop_length=HOP, units='time', backtrack=True)

    # The score, a frame per audio frame at the tempo it is expected at, with a rest either side.
    per = max(1, round(rec['sixteenth'] * SR / HOP))
    frames = [np.zeros(12)] * (2 * per)
    for n in notes:
        v = chord_vector(n['chord']) * 0.5
        v[n['midi'] % 12] += 1.0
        n['frame'] = len(frames)
        frames += [v / np.linalg.norm(v)] * (n['units'] * per)
    end_frame = len(frames)
    frames += [np.zeros(12)] * (2 * per)
    S = np.array(frames).T

    lo, hi = np.searchsorted(times, rec['from']), np.searchsorted(times, rec['to'])
    a, q = unit[:, lo:hi], quiet[lo:hi]
    C = 1 - S.T @ a
    rest = ~S.any(axis=0)
    C[rest, :] = np.where(q, 0.0, 1.0)[None, :]  # A rest is silence, and only silence.
    C[np.ix_(~rest, q)] = 0.8  # A note is never silence.
    _, wp = librosa.sequence.dtw(C=C, step_sizes_sigma=np.array([[1, 1], [1, 2], [2, 1], [1, 0], [0, 1]]),
                                 weights_add=np.array([0, 0, 0, 0.3, 0.3]))
    path = wp[::-1]
    rows, first = np.unique(path[:, 0], return_index=True)
    at = np.interp(np.arange(S.shape[1]), rows, path[first, 1]) + lo

    floor = -1.0
    for n in notes:
        t = float(times[int(round(at[n['frame']]))])
        near = onsets[(np.abs(onsets - t) < 0.15) & (onsets > floor)]
        n['start'] = float(near[np.argmin(np.abs(near - t))]) if len(near) else max(t, floor + HOP / SR)
        floor = n['start']  # Two notes never snap to one onset.
    end = float(times[int(round(at[end_frame]))])

    share = chroma / (chroma.sum(axis=0, keepdims=True) + 1e-9)
    w, reach = max(1, int(0.3 * SR / HOP)), int(0.4 * SR / HOP)
    frame = lambda t: int(round(t * SR / HOP))
    for i in range(1, len(notes)):
        p, k = notes[i - 1]['midi'] % 12, notes[i]['midi'] % 12
        if p == k:
            continue  # A repeated note keeps its onset.
        t0 = frame(notes[i]['start'])
        lo_f = max(frame(notes[i - 1]['start']) + 2, t0 - reach)
        hi_f = min(frame(notes[i + 1]['start']) - 2 if i + 1 < len(notes) else t0 + reach, t0 + reach)
        if lo_f > hi_f:
            continue  # Too close to its neighbours to move.
        d = share[k] - share[p]
        best = max(range(lo_f, hi_f + 1), key=lambda t: d[t:t + w].sum() - d[max(0, t - w):t].sum())
        notes[i]['start'] = float(times[best])
    for x, z in zip(notes, notes[1:]):
        x['end'] = z['start']
    notes[-1]['end'] = end
    return tuning, chroma


def check(notes, chroma, key):
    frame = lambda t: int(round(t * SR / HOP))
    ranks = []
    for n in notes:
        c = chroma[:, frame(n['start']):max(frame(n['end']), frame(n['start']) + 1)].mean(axis=1)
        n['rank'] = int(np.where(np.argsort(c)[::-1] == n['midi'] % 12)[0][0]) + 1
        ranks.append(n['rank'])
    root = NAMES.index(key)
    vocab = {}
    for deg, q in ((0, ''), (2, 'm'), (4, 'm'), (5, ''), (7, ''), (9, 'm'), (7, '7'), (2, '7'), (9, '7'),
                   (4, '7'), (11, '7'), (11, 'm'), (0, 'maj7')):
        name = NAMES[(root + deg) % 12] + q
        vocab[name] = chord_vector(name)
    halves, fits = {}, 0
    for n in notes:
        halves.setdefault(n['measure'], []).append(n)
    lines = []
    for mi, ns in halves.items():
        c = chroma[:, frame(ns[0]['start']):frame(ns[-1]['end'])].mean(axis=1)
        c /= np.linalg.norm(c) + 1e-9
        top = sorted(vocab, key=lambda k: -(vocab[k] @ c))[:2]
        # The score's chord, or the same chord with a seventh: a major one as D, D7 or Dmaj7, a
        # minor one as Bm or Bm7.
        root, q = parse_chord(ns[0]['chord'])
        same = ('m', 'm7') if q.startswith('m') and not q.startswith('maj') else ('', '7', 'maj7')
        ok = any(parse_chord(t)[0] == root and parse_chord(t)[1] in same for t in top)
        fits += ok
        lines.append('  %2d %6.2f  %-3s heard %-5s %-5s %s  %s' % (
            mi, ns[0]['start'], ns[0]['chord'], top[0], top[1], 'ok' if ok else '--',
            ' '.join('%s%d' % (n['text'], n['rank']) for n in ns)))
    r = np.array(ranks)
    return np.mean(r <= 3), fits / len(halves), lines, r


def chordpro(score, entry, notes):
    lines, chord, out_lines = [], None, []
    breaks = set(score['lines'])
    current = []
    for i, n in enumerate(notes):
        current.append(n)
        last_in_measure = i + 1 == len(notes) or notes[i + 1]['measure'] != n['measure']
        if last_in_measure and n['measure'] in breaks:
            lines.append(current)
            current = []
    for line in lines:
        text = stamp(line[0]['start'])
        for j, n in enumerate(line):
            first = j == 0 or n['measure'] != line[j - 1]['measure']
            mark = ''
            # Each line names the chord it starts on, so a player who comes in there can play it.
            if first and (n['chord'] != chord or n is line[0]):
                mark = ('' if n is line[0] else stamp(n['start'])) + '[%s]' % n['chord']
                chord = n['chord']
            if n['text'] == '~':
                # A chord that falls on a held note goes before the next word.
                text += mark
                continue
            word = n['text'][:-1] if n['text'].endswith('-') else n['text'] + ' '
            text += mark + word
        out_lines.append(text.rstrip())
    head = ['{title: %s}' % score['title'], '{artist: %s}' % entry.get('artist', ''),
            '{key: %s}' % score['key'], '{time: %s}' % score['time'], '{start_of_verse: Verse 1}']
    return '\n'.join(head + out_lines + ['{end_of_verse}'])


def alto(n):
    """A second voice under the tune: the highest note of the hymnal's chord under it that is at least
    a minor third below the tune's note, so the two sing the hymnal's harmony in close parts."""
    root, q = parse_chord(n['chord'])
    tones = {(root + i) % 12 for i in QUALITY[q]}
    return next(m for m in range(n['midi'] - 3, n['midi'] - 15, -1) if m % 12 in tones)


def ultrastar(score, entry, notes):
    """The tune as a duet: P1 the hymnal's soprano line, P2 an alto under it from its chords (alto()),
    on the same times and words, so Riff Sing has a lane for each and Riff Chimera two voices."""
    out = ['#TITLE:%s' % score['title'], '#ARTIST:%s' % entry.get('artist', ''),
           '#LANGUAGE:English', '#BPM:%d' % BPM, '#GAP:0', '#P1:Soprano', '#P2:Alto']
    breaks = set(score['lines'])
    beat = lambda t: int(round(t / BEAT))
    for part, pitch in (('P1', lambda n: n['midi']), ('P2', alto)):
        out.append(part)
        for i, n in enumerate(notes):
            start, end = beat(n['start']), beat(n['end'])
            if n['text'] == '~':
                text = '~'
            else:
                text = n['text'][:-1] if n['text'].endswith('-') else n['text'] + ' '
            out.append(': %d %d %d %s' % (start, max(1, end - start - 1), pitch(n) - 60, text))
            last_in_measure = i + 1 == len(notes) or notes[i + 1]['measure'] != n['measure']
            if last_in_measure and n['measure'] in breaks and i + 1 < len(notes):
                out.append('- %d' % end)
    out.append('E')
    return '\n'.join(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 2:
        sys.exit(__doc__)
    album, track = args
    folder, score, manifest, entry = load(album, track)
    audio = os.path.join(folder, 'audio', entry['file'])
    if not os.path.exists(audio):
        sys.exit('No %s: build it with npm run albums %s' % (audio, album))
    y, _ = librosa.load(audio, sr=SR, mono=True)
    notes = notes_of(score)
    tuning, chroma = align(y, notes, score['recording'])
    melody_fit, chord_fit, report, _ = check(notes, chroma, score['key'])
    print('Tuning %+.0f cents from A440. Half bars, with the chord the score gives and the two that fit'
          ' the recording best; each syllable with its note\'s rank in the recording:' % (tuning * 100))
    print('\n'.join(report))
    print('Notes whose pitch class is in the recording\'s top three: %.0f%%' % (100 * melody_fit))
    print('Half bars whose chord is the score\'s: %.0f%%' % (100 * chord_fit))
    if melody_fit < 0.7 or chord_fit < 0.9:
        sys.exit('The alignment does not hold up against the recording; nothing written.')
    chords, melody = chordpro(score, entry, notes), ultrastar(score, entry, notes)
    print('\n' + chords + '\n\n' + melody)
    if '--dry-run' in sys.argv:
        return
    def write(path, data):
        with open(path, 'w', encoding='utf-8') as f:
            f.write(json.dumps(data, indent='\t', ensure_ascii=False) + '\n')
    lyrics_path = os.path.join(folder, 'lyrics.json')
    words = json.load(open(lyrics_path, encoding='utf-8'))
    entry_words = words.setdefault(track, {})
    entry_words.update({'chords': chords, 'melody': melody, **score['credit']})
    # The lyric lines the chart covers start when the chart's do, so Riff Lyrics and Riff Sing agree.
    starts = [n['start'] for i, n in enumerate(notes)
              if i == 0 or (n['measure'] != notes[i - 1]['measure'] and notes[i - 1]['measure'] in score['lines'])]
    rows = entry_words.get('lyrics', '').split('\n')
    timed = [i for i, r in enumerate(rows) if r.startswith('[')][: score.get('lyric_lines', 0)]
    for i, at in zip(timed, starts):
        rows[i] = stamp(at) + rows[i][rows[i].index(']') + 1:]
    if timed:
        entry_words['lyrics'] = '\n'.join(rows)
    write(lyrics_path, words)
    # As album.js merges it, so the manifest needn't wait for the album to be built again.
    entry.update(words[track])
    write(os.path.join(folder, 'manifest.json'), manifest)


if __name__ == '__main__':
    main()
