<?php
/**
 * A stream wrapper for the tests: a file kept elsewhere, as an offloading plugin gives it.
 *
 * @package Riff
 */

/**
 * A file kept elsewhere, as an offloading plugin's stream wrapper gives it: readable through
 * PHP's file functions, and not a path on this server. `riffelsewhere://` and then the local path.
 */
class Riff_Test_Elsewhere {

	/**
	 * The stream's context, which PHP sets.
	 *
	 * @var resource|null
	 */
	public $context;

	/**
	 * The local file behind it.
	 *
	 * @var resource|false
	 */
	private $handle = false;

	/**
	 * The local path an address stands for.
	 *
	 * @param string $path The address.
	 * @return string
	 */
	private static function local( string $path ): string {
		return (string) substr( $path, strlen( 'riffelsewhere://' ) );
	}

	// phpcs:disable WordPress.NamingConventions.ValidFunctionName, WordPress.WP.AlternativeFunctions, WordPress.PHP.NoSilencedErrors -- PHP's own names for a stream wrapper's methods, over plain file calls.

	public function stream_open( string $path, string $mode ): bool {
		$this->handle = is_file( self::local( $path ) ) && 'r' === $mode[0] ? fopen( self::local( $path ), 'rb' ) : false;
		return (bool) $this->handle;
	}

	public function stream_read( int $count ) {
		return fread( $this->handle, $count );
	}

	public function stream_eof(): bool {
		return feof( $this->handle );
	}

	public function stream_stat() {
		return fstat( $this->handle );
	}

	public function stream_close(): void {
		fclose( $this->handle );
	}

	public function url_stat( string $path ) {
		return is_file( self::local( $path ) ) ? stat( self::local( $path ) ) : false;
	}

	// phpcs:enable
}
