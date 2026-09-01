import { describe, it, expect } from 'vitest';
import { normalizeForSearch, searchTracks, totalTrackCount } from './trackSearch';
import type { RankedTracks, Track } from '../types/track';

function track(id: string, title: string, artist: string, score: number): Track {
  return {
    id,
    title,
    artist,
    albumArtUrl: null,
    difficultyLevel: 'BEGINNER',
    difficultyScore: score,
    lyricsSynced: true,
    masteredPct: 0,
  };
}

const ranked: RankedTracks = {
  levels: {
    BEGINNER: {
      count: 2,
      tracks: [
        track('b1', 'Yesterday', 'The Beatles', 1.2),
        track('b2', "Don't Stop Me Now", 'Queen', 2.8),
      ],
    },
    INTERMEDIATE: {
      count: 2,
      tracks: [
        track('i1', 'Heroes', 'David Bowie', 4.5),
        track('i2', 'Halo', 'Beyoncé', 5.1),
      ],
    },
    ADVANCED: {
      count: 1,
      tracks: [track('a1', 'Rap God', 'Eminem', 7.4)],
    },
  },
};

const ids = (q: string) => searchTracks(ranked, q).map((r) => r.track.id);

describe('normalizeForSearch', () => {
  it('strips diacritics and lowercases', () => {
    expect(normalizeForSearch('Beyoncé')).toBe('beyonce');
  });

  it('drops apostrophes rather than splitting on them', () => {
    expect(normalizeForSearch("Don't Stop")).toBe('dont stop');
    expect(normalizeForSearch('Don’t Stop')).toBe('dont stop');
  });

  it('collapses other punctuation and whitespace to single spaces', () => {
    expect(normalizeForSearch('  Hello -- World!  ')).toBe('hello world');
  });
});

describe('searchTracks', () => {
  it('returns nothing for an empty or punctuation-only query', () => {
    expect(searchTracks(ranked, '')).toEqual([]);
    expect(searchTracks(ranked, '   ')).toEqual([]);
    expect(searchTracks(ranked, '!!!')).toEqual([]);
  });

  it('searches across all three difficulty buckets', () => {
    // One hit from each level proves the search is not tab-scoped.
    expect(ids('yesterday')).toEqual(['b1']);
    expect(ids('heroes')).toEqual(['i1']);
    expect(ids('rap god')).toEqual(['a1']);
  });

  it('reports which level each result came from', () => {
    expect(searchTracks(ranked, 'rap god')[0].level).toBe('ADVANCED');
    expect(searchTracks(ranked, 'halo')[0].level).toBe('INTERMEDIATE');
  });

  it('matches on artist as well as title', () => {
    expect(ids('queen')).toEqual(['b2']);
    expect(ids('bowie')).toEqual(['i1']);
  });

  it('accepts terms in any order across title and artist', () => {
    expect(ids('bowie heroes')).toEqual(['i1']);
    expect(ids('heroes bowie')).toEqual(['i1']);
  });

  it('is case- and diacritic-insensitive', () => {
    expect(ids('BEYONCE')).toEqual(['i2']);
    expect(ids('beyoncé')).toEqual(['i2']);
  });

  it('finds apostrophed titles typed without the apostrophe', () => {
    expect(ids('dont stop')).toEqual(['b2']);
    expect(ids("don't stop")).toEqual(['b2']);
  });

  it('ranks title-prefix above title-substring above artist-only', () => {
    const r: RankedTracks = {
      levels: {
        BEGINNER: {
          count: 3,
          tracks: [
            track('artistOnly', 'Something Else', 'Halo Band', 1.0),
            track('substring', 'Blue Halo Sky', 'Someone', 2.0),
            track('prefix', 'Halo Dreams', 'Another', 3.0),
          ],
        },
      },
    };
    expect(searchTracks(r, 'halo').map((x) => x.track.id)).toEqual([
      'prefix',
      'substring',
      'artistOnly',
    ]);
  });

  it('breaks rank ties easiest-first', () => {
    const r: RankedTracks = {
      levels: {
        BEGINNER: { count: 1, tracks: [track('hard', 'Love Hard', 'X', 9.0)] },
        INTERMEDIATE: { count: 1, tracks: [track('easy', 'Love Easy', 'Y', 1.0)] },
      },
    };
    expect(searchTracks(r, 'love').map((x) => x.track.id)).toEqual(['easy', 'hard']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(ids('zzzznotathing')).toEqual([]);
  });

  it('tolerates missing buckets', () => {
    expect(searchTracks({ levels: {} }, 'anything')).toEqual([]);
  });
});

describe('totalTrackCount', () => {
  it('sums tracks across the three buckets', () => {
    expect(totalTrackCount(ranked)).toBe(5);
  });

  it('is zero for an empty payload', () => {
    expect(totalTrackCount({ levels: {} })).toBe(0);
  });
});
