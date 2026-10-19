/**
 * A small PHP tokenizer and the scans built on it.
 *
 * It is not a parser. It knows enough about PHP to skip inline HTML, comments and string contents,
 * so a function name inside a comment or a string is never counted as a call, and it keeps doc
 * comments and string values because hook names and since tags live there.
 */

const KEYWORDS = new Set( [
	'abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch', 'class', 'clone', 'const',
	'continue', 'declare', 'default', 'do', 'echo', 'else', 'elseif', 'empty', 'enddeclare', 'endfor',
	'endforeach', 'endif', 'endswitch', 'endwhile', 'enum', 'eval', 'exit', 'die', 'extends', 'final',
	'finally', 'fn', 'for', 'foreach', 'function', 'global', 'goto', 'if', 'implements', 'include',
	'include_once', 'instanceof', 'insteadof', 'interface', 'isset', 'list', 'match', 'namespace', 'new',
	'or', 'print', 'private', 'protected', 'public', 'readonly', 'require', 'require_once', 'return',
	'static', 'switch', 'throw', 'trait', 'try', 'unset', 'use', 'var', 'while', 'xor', 'yield', 'self',
	'parent', 'true', 'false', 'null',
] );

const PUNCT = [ '?->', '...', '->', '::', '=>', '??', '<=>', '===', '!==', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '.=', '+=', '-=' ];

/**
 * Splits PHP source into tokens.
 *
 * @param {string} src PHP source, including any inline HTML.
 * @return {Array<{t: string, v: string, line: number}>} Tokens: id, var, str, doc, num and punct.
 */
function tokenize( src ) {
	const out = [];
	let i = 0;
	let line = 1;
	const n = src.length;
	const count = ( from, to ) => {
		for ( let k = from; k < to; k++ ) {
			if ( src.charCodeAt( k ) === 10 ) {
				line++;
			}
		}
	};
	const push = ( t, v, at ) => out.push( { t, v, line: at } );

	// Inline HTML until the first open tag.
	const html = () => {
		const open = src.indexOf( '<?', i );
		const end = open === -1 ? n : open;
		count( i, end );
		i = end;
		if ( open === -1 ) {
			return;
		}
		if ( src.startsWith( '<?php', i ) ) {
			i += 5;
		} else if ( src.startsWith( '<?=', i ) ) {
			i += 3;
			push( 'id', 'echo', line );
		} else {
			i += 2;
		}
	};

	html();
	while ( i < n ) {
		const c = src[ i ];
		const start = line;
		if ( c === '\n' ) {
			line++;
			i++;
			continue;
		}
		if ( c === ' ' || c === '\t' || c === '\r' ) {
			i++;
			continue;
		}
		if ( c === '?' && src[ i + 1 ] === '>' ) {
			i += 2;
			push( 'punct', ';', start );
			html();
			continue;
		}
		// Comments. `#[` opens an attribute, not a comment.
		if ( ( c === '/' && src[ i + 1 ] === '/' ) || ( c === '#' && src[ i + 1 ] !== '[' ) ) {
			while ( i < n && src[ i ] !== '\n' && ! ( src[ i ] === '?' && src[ i + 1 ] === '>' ) ) {
				i++;
			}
			continue;
		}
		if ( c === '/' && src[ i + 1 ] === '*' ) {
			const end = src.indexOf( '*/', i + 2 );
			const stop = end === -1 ? n : end + 2;
			const text = src.slice( i, stop );
			count( i, stop );
			if ( text.startsWith( '/**' ) ) {
				push( 'doc', text, start );
			}
			i = stop;
			continue;
		}
		if ( c === '\'' ) {
			let j = i + 1;
			let v = '';
			while ( j < n && src[ j ] !== '\'' ) {
				if ( src[ j ] === '\\' && ( src[ j + 1 ] === '\'' || src[ j + 1 ] === '\\' ) ) {
					v += src[ j + 1 ];
					j += 2;
					continue;
				}
				v += src[ j ];
				j++;
			}
			count( i, j );
			push( 'str', v, start );
			i = j + 1;
			continue;
		}
		if ( c === '"' || c === '`' ) {
			let j = i + 1;
			while ( j < n && src[ j ] !== c ) {
				j += src[ j ] === '\\' ? 2 : 1;
			}
			const v = src.slice( i + 1, j );
			count( i, j );
			out.push( { t: 'str', v, line: start, interp: c === '"' && /\$/.test( v ) } );
			i = j + 1;
			continue;
		}
		if ( c === '<' && src.startsWith( '<<<', i ) ) {
			const m = /^<<<[ \t]*(['"]?)([A-Za-z_]\w*)\1\r?\n/.exec( src.slice( i, i + 80 ) );
			if ( m ) {
				const body = i + m[ 0 ].length;
				const close = new RegExp( '^[ \\t]*' + m[ 2 ] + '\\b', 'm' );
				const rest = src.slice( body );
				const found = close.exec( rest );
				const stop = found ? body + found.index + found[ 0 ].length : n;
				count( i, stop );
				out.push( { t: 'str', v: rest.slice( 0, found ? found.index : rest.length ), line: start, interp: m[ 1 ] !== '\'' } );
				i = stop;
				continue;
			}
		}
		if ( c === '$' && /[A-Za-z_]/.test( src[ i + 1 ] || '' ) ) {
			const m = /^\$[A-Za-z_]\w*/.exec( src.slice( i, i + 128 ) );
			push( 'var', m[ 0 ], start );
			i += m[ 0 ].length;
			continue;
		}
		if ( /[A-Za-z_\\\x80-￿]/.test( c ) ) {
			const m = /^\\?[A-Za-z_\x80-￿][\w\x80-￿]*(?:\\[A-Za-z_\x80-￿][\w\x80-￿]*)*/.exec( src.slice( i, i + 256 ) );
			if ( m ) {
				push( 'id', m[ 0 ], start );
				i += m[ 0 ].length;
				continue;
			}
		}
		if ( /[0-9]/.test( c ) ) {
			const m = /^[0-9][\w.]*/.exec( src.slice( i, i + 64 ) );
			push( 'num', m[ 0 ], start );
			i += m[ 0 ].length;
			continue;
		}
		const p = PUNCT.find( ( s ) => src.startsWith( s, i ) );
		push( 'punct', p || c, start );
		i += p ? p.length : 1;
	}
	return out;
}

/**
 * The value of a hook name argument starting at token k, as one string. Interpolated variables and
 * concatenated expressions become `{$...}` placeholders, the way the developer reference writes
 * dynamic hook names.
 *
 * @param {Array}  tokens Tokens from tokenize().
 * @param {number} k      Index of the argument's first token.
 * @return {string|null} The name, or null when the argument has no literal part.
 */
function hookName( tokens, k ) {
	let name = '';
	let literal = false;
	let depth = 0;
	for ( let j = k; j < tokens.length; j++ ) {
		const tok = tokens[ j ];
		if ( tok.t === 'punct' && ( tok.v === '(' || tok.v === '[' ) ) {
			depth++;
		} else if ( tok.t === 'punct' && ( tok.v === ')' || tok.v === ']' ) ) {
			if ( depth === 0 ) {
				break;
			}
			depth--;
			continue;
		} else if ( depth === 0 && tok.t === 'punct' && tok.v === ',' ) {
			break;
		}
		if ( depth > 0 ) {
			continue;
		}
		if ( tok.t === 'str' ) {
			literal = true;
			name += tok.interp ? tok.v.replace( /\{?\$[\w>\-[\]'"]+\}?/g, ( v ) => ( v.startsWith( '{' ) ? v : `{${ v }}` ) ) : tok.v;
		} else if ( tok.t === 'var' ) {
			name += `{${ tok.v }}`;
		} else if ( tok.t === 'punct' && tok.v === '.' ) {
			continue;
		} else if ( tok.t === 'punct' && ( tok.v === '->' || tok.v === '::' ) ) {
			// Part of a variable expression already written as a placeholder: $post->post_type.
			const next = tokens[ j + 1 ];
			if ( next && next.t === 'id' && name.endsWith( '}' ) ) {
				name = name.slice( 0, -1 ) + tok.v + next.v + '}';
				j++;
			}
		} else if ( tok.t === 'id' ) {
			name += `{${ tok.v }}`;
		}
	}
	return literal ? name : null;
}

/**
 * Normalizes a hook name so `save_post_{$post->post_type}` and `save_post_{$type}` compare equal.
 *
 * @param {string} name A hook name.
 * @return {string} The name with every placeholder as `*`.
 */
const hookShape = ( name ) => name.replace( /\{[^{}]*\}/g, '*' );

/**
 * Reads the tags of a doc comment.
 *
 * @param {string} doc The doc comment.
 * @return {{since: string|null, deprecated: boolean, private: boolean}} What the report needs.
 */
function docTags( doc ) {
	if ( ! doc ) {
		return { since: null, deprecated: false, private: false };
	}
	const since = /@since\s+(?:MU\s*\()?([0-9][0-9.]*)/.exec( doc );
	return {
		since: since ? since[ 1 ].replace( /\.$/, '' ) : null,
		deprecated: /@deprecated\b/.test( doc ),
		private: /@access\s+private\b/.test( doc ) || /@ignore\b/.test( doc ),
	};
}

module.exports = { tokenize, hookName, hookShape, docTags, KEYWORDS };
