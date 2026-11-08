/**
 * An example renderer: a post as email-safe HTML, from riff/v1/posts/{id}/blocks.
 *
 * Email clients play no audio, run no script and read little CSS, so this draws what a mail
 * reader can show: tables, inline styles, the post's own text and images, and each album as a
 * cover, its name and a numbered track list whose titles open the track on the site
 * (?riff_track={id}, the address the player shares). Every block is walked by its innerContent, the
 * markup in pieces with a gap for each inner block, so a group, a list or a quote comes out in the
 * order the post has it; markup is kept only from a short list of tags and attributes.
 *
 *     node packages/types/examples/email.js https://example.com/wp-json/ 42 > post.html
 *
 * @module
 */
import { createClient } from '../client.js';

/** @typedef {import('../index.js').Block} Block */
/** @typedef {import('../index.js').Track} Track */
/** @typedef {import('../index.js').PostBlocksResponse} PostBlocksResponse */

const INK = '#1c1c1c';
const MUTED = '#6b6b6b';
const RULE = '#e4e4e4';
const FONT = 'font-family:Georgia,\'Times New Roman\',serif;';

// The tags kept, each with the inline style a mail client needs to draw it, and the attributes kept.
const TAGS = {
	p: 'margin:0 0 16px;line-height:1.6;',
	h1: 'margin:24px 0 12px;font-size:28px;line-height:1.25;',
	h2: 'margin:24px 0 12px;font-size:24px;line-height:1.25;',
	h3: 'margin:20px 0 10px;font-size:20px;line-height:1.3;',
	h4: 'margin:16px 0 8px;font-size:17px;',
	h5: 'margin:16px 0 8px;font-size:15px;',
	h6: 'margin:16px 0 8px;font-size:14px;',
	ul: 'margin:0 0 16px;padding-left:24px;',
	ol: 'margin:0 0 16px;padding-left:24px;',
	li: 'margin:0 0 6px;line-height:1.6;',
	blockquote: `margin:0 0 16px;padding:0 0 0 16px;border-left:3px solid ${ RULE };color:${ MUTED };`,
	figure: 'margin:0 0 16px;',
	figcaption: `margin:6px 0 0;font-size:13px;color:${ MUTED };`,
	img: 'display:block;max-width:100%;height:auto;border:0;',
	a: `color:${ INK };text-decoration:underline;`,
	strong: '',
	b: '',
	em: '',
	i: '',
	code: 'font-family:Menlo,Consolas,monospace;font-size:0.9em;',
	br: '',
	hr: `border:0;border-top:1px solid ${ RULE };margin:24px 0;`,
	sub: '',
	sup: '',
	s: '',
	mark: 'background:#fff3b0;',
};
const ATTRS = { a: [ 'href' ], img: [ 'src', 'alt', 'width', 'height' ] };
// Dropped with everything inside them.
const GONE = /<(script|style|iframe|object|embed|audio|video|svg|math|form|noscript|template|select|textarea|button)\b[\s\S]*?<\/\1\s*>/gi;
const GONE_OPEN = /<\/?(script|style|iframe|object|embed|audio|video|source|track|svg|math|form|noscript|template|select|textarea|button|input|link|meta|base)\b[^>]*>/gi;

/**
 * Escapes text for HTML.
 *
 * @param {*} s Text.
 * @return {string} Escaped.
 */
export const esc = ( s ) =>
	String( s ?? '' ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } )[ c ] );

/**
 * An http, https or mailto address, or nothing.
 *
 * @param {string} url An address.
 * @return {string} It, or nothing.
 */
const href = ( url ) => ( /^(https?:|mailto:)/i.test( String( url ).trim() ) ? String( url ).trim() : '' );

/**
 * Markup from a block, kept to the tags and attributes in TAGS and ATTRS, with their inline styles.
 * Everything else is dropped, its text kept; script, styles, players and forms go whole.
 *
 * @param {string} html Markup.
 * @return {string} Email-safe markup.
 */
export function safe( html ) {
	const src = String( html || '' )
		.replace( /<!--[\s\S]*?-->/g, '' )
		.replace( GONE, '' )
		.replace( GONE_OPEN, '' );
	return src
		.split( /(<[^<>]*>)/ )
		.map( ( part ) => {
			const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>$/.exec( part );
			if ( ! tag ) {
				// Text, already escaped in the post; a stray bracket is escaped here.
				return part.replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
			}
			const name = tag[ 2 ].toLowerCase();
			if ( ! ( name in TAGS ) ) {
				return '';
			}
			if ( tag[ 1 ] ) {
				return name === 'br' || name === 'img' || name === 'hr' ? '' : `</${ name }>`;
			}
			const attrs = {};
			for ( const m of tag[ 3 ].matchAll( /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g ) ) {
				attrs[ m[ 1 ].toLowerCase() ] = m[ 2 ] ?? m[ 3 ] ?? m[ 4 ] ?? '';
			}
			let out = `<${ name }`;
			for ( const a of ATTRS[ name ] || [] ) {
				let value = attrs[ a ];
				if ( value === undefined ) {
					continue;
				}
				// Decoded, so &amp; is not doubled, then escaped once.
				value = value.replace( /&amp;/g, '&' ).replace( /&quot;/g, '"' ).replace( /&#0*39;/g, "'" );
				if ( a === 'href' || a === 'src' ) {
					value = href( value );
					if ( ! value || ( a === 'src' && /^mailto:/i.test( value ) ) ) {
						continue;
					}
				}
				if ( ( a === 'width' || a === 'height' ) && ! /^\d+$/.test( value ) ) {
					continue;
				}
				out += ` ${ a }="${ esc( value ) }"`;
			}
			if ( TAGS[ name ] ) {
				out += ` style="${ TAGS[ name ] }"`;
			}
			return `${ out }${ name === 'br' || name === 'img' || name === 'hr' ? ' /' : '' }>`;
		} )
		.join( '' );
}

/**
 * A length in seconds as m:ss, or nothing when unknown.
 *
 * @param {number} seconds Seconds.
 * @return {string} The length.
 */
export function length( seconds ) {
	const s = Math.round( Number( seconds ) || 0 );
	return s > 0 ? `${ Math.floor( s / 60 ) }:${ String( s % 60 ).padStart( 2, '0' ) }` : '';
}

/**
 * Where a track opens on the site: its post, with the track named, as the player shares it.
 *
 * @param {Track}  track Track.
 * @param {string} url   The post's address, for a track that names no post.
 * @return {string} An address.
 */
function listenAt( track, url ) {
	const base = href( track.post?.url || url );
	if ( ! base || ! track.id ) {
		return '';
	}
	return `${ base }${ base.includes( '?' ) ? '&' : '?' }riff_track=${ encodeURIComponent( track.id ) }`;
}

/**
 * The largest artwork the tracks have.
 *
 * @param {Track[]} tracks Tracks.
 * @return {Object|null} `{ src, sizes, alt }`, or null.
 */
function cover( tracks ) {
	const art = tracks.find( ( t ) => t.art?.length )?.art || [];
	return art.length ? art[ art.length - 1 ] : null;
}

/**
 * An album: its cover, its name and artist, and its tracks in order.
 *
 * @param {Track[]} tracks The tracks.
 * @param {string}  url    The post's address.
 * @return {string} Markup.
 */
export function album( tracks, url ) {
	const playable = tracks.filter( Boolean );
	if ( ! playable.length ) {
		return '';
	}
	const first = playable[ 0 ];
	const one = ( key ) => ( playable.every( ( t ) => t[ key ] === first[ key ] ) ? first[ key ] : '' );
	const art = cover( playable );
	const name = one( 'album' );
	const artist = one( 'artist' );
	const total = length( playable.reduce( ( sum, t ) => sum + ( Number( t.duration ) || 0 ), 0 ) );
	let out = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-collapse:collapse;">`;
	out += '<tr>';
	if ( art?.src && href( art.src ) ) {
		out += `<td width="120" valign="top" style="padding:0 16px 12px 0;"><img src="${ esc( href( art.src ) ) }" width="120" height="120" alt="${ esc( art.alt || '' ) }" style="display:block;width:120px;height:120px;border:0;" /></td>`;
	}
	out += `<td valign="top" style="padding:0 0 12px;${ FONT }">`;
	out += name ? `<div style="font-size:20px;line-height:1.3;color:${ INK };">${ esc( name ) }</div>` : '';
	out += artist ? `<div style="font-size:15px;color:${ MUTED };">${ esc( artist ) }</div>` : '';
	out += `<div style="font-size:13px;color:${ MUTED };padding-top:4px;">${ playable.length === 1 ? '1 track' : `${ playable.length } tracks` }${ total ? ` · ${ total }` : '' }</div>`;
	out += '</td></tr></table>';

	out += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-collapse:collapse;${ FONT }">`;
	playable.forEach( ( t, i ) => {
		const link = t.locked ? href( t.unlock ) : listenAt( t, url );
		const title = link ? `<a href="${ esc( link ) }" style="color:${ INK };text-decoration:none;">${ esc( t.title ) }</a>` : esc( t.title );
		const by = t.artist && t.artist !== artist ? `<div style="font-size:13px;color:${ MUTED };">${ esc( t.artist ) }</div>` : '';
		const note = t.locked ? `<div style="font-size:13px;color:${ MUTED };">${ link ? 'Unlock to listen' : 'Not available to play' }</div>` : '';
		out += `<tr><td width="28" valign="top" style="padding:8px 8px 8px 0;border-top:1px solid ${ RULE };font-size:13px;color:${ MUTED };">${ i + 1 }</td>`;
		out += `<td valign="top" style="padding:8px 0;border-top:1px solid ${ RULE };font-size:15px;"${ t.lang ? ` lang="${ esc( t.lang ) }"` : '' }>${ title }${ by }${ note }</td>`;
		out += `<td width="48" align="right" valign="top" style="padding:8px 0;border-top:1px solid ${ RULE };font-size:13px;color:${ MUTED };">${ esc( length( t.duration ) ) }</td></tr>`;
	} );
	out += '</table>';
	return out;
}

const MEDIA = [ 'core/audio', 'core/video' ];

/**
 * Blocks, in order, with each run of audio and video blocks side by side drawn as one album.
 *
 * @param {Block[]} list Blocks.
 * @param {string}  url  The post's address.
 * @return {string} Markup.
 */
export function blocks( list, url ) {
	let out = '';
	let run = [];
	const flush = () => {
		out += album( run, url );
		run = [];
	};
	for ( const b of list ) {
		if ( MEDIA.includes( b.blockName || '' ) && b.track ) {
			run.push( b.track );
			continue;
		}
		flush();
		out += block( b, url );
	}
	flush();
	return out;
}

/**
 * One block: a playlist as an album, a lone track as an album of one, and any other block as its
 * own markup, kept safe, with its inner blocks where its innerContent puts them.
 *
 * @param {Block}  b   Block.
 * @param {string} url The post's address.
 * @return {string} Markup.
 */
export function block( b, url ) {
	if ( b.blockName === 'core/playlist' ) {
		return album( ( b.innerBlocks || [] ).map( ( t ) => t.track ).filter( Boolean ), url );
	}
	if ( MEDIA.includes( b.blockName || '' ) || b.blockName === 'core/playlist-track' ) {
		return b.track ? album( [ b.track ], url ) : '';
	}
	const inner = [ ...( b.innerBlocks || [] ) ];
	const parts = b.innerContent?.length ? b.innerContent : [ b.innerHTML || '' ];
	// Inner blocks that sit side by side, with no markup between, are drawn together, so a group
	// of audio blocks is one album.
	let out = '';
	let pending = [];
	for ( const part of parts ) {
		if ( part === null ) {
			pending.push( inner.shift() );
			continue;
		}
		if ( pending.length && part.trim() === '' ) {
			continue;
		}
		out += blocks( pending.filter( Boolean ), url );
		pending = [];
		out += safe( part );
	}
	return out + blocks( pending.filter( Boolean ), url );
}

/**
 * A post as a whole email: its title, its blocks, and a link to read it on the site.
 *
 * @param {PostBlocksResponse} post What riff/v1/posts/{id}/blocks answers.
 * @return {string} An HTML document.
 */
export function renderEmail( post ) {
	const url = href( post.url );
	return [
		'<!DOCTYPE html>',
		'<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />',
		`<title>${ esc( post.title ) }</title></head>`,
		`<body style="margin:0;padding:0;background:#f6f6f4;">`,
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f4;"><tr><td align="center" style="padding:24px 12px;">',
		`<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-collapse:collapse;"><tr><td style="padding:32px 28px;${ FONT }color:${ INK };font-size:16px;">`,
		`<h1 style="margin:0 0 24px;font-size:30px;line-height:1.2;">${ url ? `<a href="${ esc( url ) }" style="color:${ INK };text-decoration:none;">${ esc( post.title ) }</a>` : esc( post.title ) }</h1>`,
		blocks( post.blocks || [], url ),
		url ? `<p style="margin:24px 0 0;font-size:14px;"><a href="${ esc( url ) }" style="color:${ INK };">Listen on the site</a></p>` : '',
		'</td></tr></table>',
		'</td></tr></table>',
		'</body></html>',
		'',
	].join( '\n' );
}

// node packages/types/examples/email.js <rest root> <post id>
if ( typeof process !== 'undefined' && process.argv?.[ 1 ] && new URL( import.meta.url ).pathname === process.argv[ 1 ] ) {
	const [ root, id ] = process.argv.slice( 2 );
	if ( ! root || ! id ) {
		// eslint-disable-next-line no-console
		console.error( 'Usage: node packages/types/examples/email.js <rest root> <post id>' );
		process.exit( 1 );
	}
	const client = createClient( { root } );
	const post = await client.request( 'GET /riff/v1/posts/{id}/blocks', { id: Number( id ) } );
	process.stdout.write( renderEmail( post ) );
}
