import type { Block, PostBlocksResponse, Track } from '../index.js';

/** Escapes text for HTML. */
export declare function esc( s: unknown ): string;
/** Markup kept to a short list of tags and attributes, each with its inline style. */
export declare function safe( html: string ): string;
/** Seconds as m:ss, or an empty string when unknown. */
export declare function length( seconds: number ): string;
/** An album: cover, name, artist and a numbered track list. */
export declare function album( tracks: Track[], url: string ): string;
/** Blocks in order, a run of audio and video blocks drawn as one album. */
export declare function blocks( blocks: Block[], url: string ): string;
/** One block, its inner blocks where its innerContent puts them. */
export declare function block( block: Block, url: string ): string;
/** A post as a whole email-safe HTML document. */
export declare function renderEmail( post: PostBlocksResponse ): string;
