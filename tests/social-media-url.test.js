import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSocialMediaUrl } from '@melloway/domain';

const tiktok = {
  platform: 'tiktok',
  id: '6718335390845095173',
  normalizedUrl: 'https://www.tiktok.com/@scout2015/video/6718335390845095173',
};
const instagram = {
  platform: 'instagram',
  id: 'DJf0_RmSd-T',
  normalizedUrl: 'https://www.instagram.com/reel/DJf0_RmSd-T/',
};

const valid = [
  ['TikTok full URL', tiktok.normalizedUrl, tiktok],
  ['TikTok bare host', 'https://tiktok.com/@scout2015/video/6718335390845095173', tiktok],
  ['TikTok sharing parameters and fragment', `${tiktok.normalizedUrl}/?is_from_webapp=1#player`, tiktok],
  ['TikTok HTTP, host case and surrounding whitespace', ' \nHTTP://WWW.TIKTOK.COM/@scout2015/video/6718335390845095173\t ', tiktok],
  ['TikTok username punctuation and case', 'https://www.tiktok.com/@Creator.name_2/video/6718335390845095173', {
    ...tiktok, normalizedUrl: 'https://www.tiktok.com/@Creator.name_2/video/6718335390845095173',
  }],
  ['TikTok numeric ID stays a string', 'https://www.tiktok.com/@creator/video/0012345678901234567890', {
    platform: 'tiktok', id: '0012345678901234567890',
    normalizedUrl: 'https://www.tiktok.com/@creator/video/0012345678901234567890',
  }],
  ['Instagram full URL', instagram.normalizedUrl, instagram],
  ['Instagram bare host without trailing slash', 'https://instagram.com/reel/DJf0_RmSd-T', instagram],
  ['Instagram sharing parameters and fragment', `${instagram.normalizedUrl}?igsh=abc#comments`, instagram],
  ['Instagram HTTP, host case and surrounding whitespace', ' HTTP://INSTAGRAM.COM/reel/DJf0_RmSd-T/ ', instagram],
];

for (const [label, input, expected] of valid) {
  test(`accepts and normalizes ${label}`, () => {
    assert.deepEqual(parseSocialMediaUrl(input), expected);
    assert.deepEqual(parseSocialMediaUrl(expected.normalizedUrl), expected);
  });
}

const invalid = [
  ['empty input', ''],
  ['whitespace only', ' \n\t '],
  ['missing input', undefined],
  ['null', null],
  ['a number', 123],
  ['an object', { url: instagram.normalizedUrl }],
  ['plain text', 'not a URL'],
  ['a missing scheme', 'www.instagram.com/reel/DJf0_RmSd-T/'],
  ['a relative URL', '/reel/DJf0_RmSd-T/'],
  ['a protocol-relative URL', '//www.instagram.com/reel/DJf0_RmSd-T/'],
  ['FTP', 'ftp://www.instagram.com/reel/DJf0_RmSd-T/'],
  ['JavaScript', 'javascript:alert(1)'],
  ['a malformed authority', 'https:///www.instagram.com/reel/DJf0_RmSd-T/'],
  ['an unsupported platform', 'https://www.youtube.com/shorts/DJf0_RmSd-T'],
  ['a lookalike host', 'https://www.tiktok.com.evil.example/@scout2015/video/6718335390845095173'],
  ['a host suffix', 'https://notinstagram.com/reel/DJf0_RmSd-T/'],
  ['an unsupported subdomain', 'https://m.tiktok.com/@scout2015/video/6718335390845095173'],
  ['credentials', 'https://user:password@www.instagram.com/reel/DJf0_RmSd-T/'],
  ['a credential host trick', 'https://www.instagram.com@evil.example/reel/DJf0_RmSd-T/'],
  ['an explicit port', 'https://www.instagram.com:443/reel/DJf0_RmSd-T/'],
  ['a vm TikTok short link', 'https://vm.tiktok.com/ABC123/'],
  ['a vt TikTok short link', 'https://vt.tiktok.com/ABC123/'],
  ['a TikTok share redirect', 'https://www.tiktok.com/t/ABC123/'],
  ['an Instagram short link', 'https://instagr.am/reel/DJf0_RmSd-T/'],
  ['an Instagram share redirect', 'https://www.instagram.com/share/reel/ABC123/'],
  ['a TikTok profile', 'https://www.tiktok.com/@scout2015'],
  ['a TikTok photo post', 'https://www.tiktok.com/@scout2015/photo/6718335390845095173'],
  ['a missing TikTok username', 'https://www.tiktok.com/@/video/6718335390845095173'],
  ['a missing TikTok ID', 'https://www.tiktok.com/@scout2015/video/'],
  ['a nonnumeric TikTok ID', 'https://www.tiktok.com/@scout2015/video/123abc'],
  ['an extra TikTok path', `${tiktok.normalizedUrl}/embed`],
  ['an Instagram profile', 'https://www.instagram.com/creator/'],
  ['an Instagram post', 'https://www.instagram.com/p/DJf0_RmSd-T/'],
  ['an Instagram story', 'https://www.instagram.com/stories/creator/123/'],
  ['a missing Reel ID', 'https://www.instagram.com/reel/'],
  ['an invalid Reel ID character', 'https://www.instagram.com/reel/DJf0.RmSd-T/'],
  ['an extra Reel path', `${instagram.normalizedUrl}embed/`],
  ['an encoded path separator', 'https://www.instagram.com/reel%2FDJf0_RmSd-T/'],
  ['an encoded ID character', 'https://www.instagram.com/reel/%44Jf0_RmSd-T/'],
  ['a repeated slash', 'https://www.instagram.com//reel/DJf0_RmSd-T/'],
  ['a dot segment', 'https://www.instagram.com/other/../reel/DJf0_RmSd-T/'],
  ['a backslash', 'https://www.instagram.com\\reel/DJf0_RmSd-T/'],
  ['internal whitespace', 'https://www.instagram.com/reel/DJf0_Rm Sd-T/'],
  ['an embedded newline', 'https://www.insta\ngram.com/reel/DJf0_RmSd-T/'],
];

for (const [label, input] of invalid) {
  test(`rejects ${label}`, () => {
    assert.equal(parseSocialMediaUrl(input), null);
  });
}
