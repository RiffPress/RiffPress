import type { Route, Routes } from './index.js';

export type { Route, Routes };

/** What a route takes, the parameters in its address included. */
export type Params<K extends Route> = Routes[ K ][ 'params' ];

/** What a route answers. */
export type Response<K extends Route> = Routes[ K ][ 'response' ];

/** Params may be left out when nothing in them is required. */
type Args<K extends Route> = Record<string, never> extends Params<K>
	? [ params?: Params<K>, init?: RequestInit ]
	: Partial<Params<K>> extends Params<K>
		? [ params?: Params<K>, init?: RequestInit ]
		: [ params: Params<K>, init?: RequestInit ];

export interface ClientOptions {
	/** The REST API's root: `https://example.com/wp-json/`, or `https://example.com/?rest_route=/`. wpApiSettings.root, then /wp-json/, by default. */
	root?: string;
	/** A wp_rest nonce for a signed-in listener in the browser. wpApiSettings.nonce by default. */
	nonce?: string;
	/** The fetch to use; the global one by default. */
	fetch?: typeof fetch;
	/** Headers for every request, such as an application password's Authorization. */
	headers?: Record<string, string>;
}

export interface RiffClient {
	/** The root it sends to. */
	readonly root: string;
	/**
	 * Calls a route by its method and address, as Routes names it.
	 *
	 *     await client.request( 'GET /riff/v1/posts/{id}/blocks', { id: 42 } );
	 */
	request<K extends Route>( route: K, ...args: Args<K> ): Promise<Response<K>>;
}

/** What a route refused, with WordPress's own error code and HTTP status. */
export declare class RiffError extends Error {
	readonly code: string;
	readonly status: number;
	readonly data: unknown;
	constructor( message: string, details?: { code?: string; status?: number; data?: unknown } );
}

export declare function createClient( options?: ClientOptions ): RiffClient;
