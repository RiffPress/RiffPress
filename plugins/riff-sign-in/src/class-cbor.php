<?php
/**
 * A CBOR decoder for what WebAuthn hands over.
 *
 * @package Riff\SignIn
 */

namespace Riff\SignIn;

// Riff Sign In is its own plugin with its own text domain; phpcs.xml.dist holds Riff's to `riff`.
// phpcs:set WordPress.WP.I18n text_domain[] riff-sign-in

defined( 'ABSPATH' ) || exit;

/**
 * Decodes the subset of CBOR (RFC 8949) an attestation object and a COSE key use: unsigned and
 * negative integers, byte and text strings, arrays and maps, and the simple values. Anything else,
 * and anything malformed or cut short, is refused with an exception, since the bytes come from a
 * browser the site cannot trust further than that.
 */
final class Cbor {

	/**
	 * The bytes.
	 *
	 * @var string
	 */
	private string $bytes;

	/**
	 * Where the next item starts.
	 *
	 * @var int
	 */
	private int $at = 0;

	/**
	 * Decodes one CBOR item, and reports how many bytes it took.
	 *
	 * @param string $bytes The bytes.
	 * @param int    $used  Set to how many bytes the item took.
	 * @return mixed The item: int, string, array (a list, or a map with int or string keys), bool or null.
	 * @throws \RuntimeException On bytes that are not the CBOR this reads.
	 */
	public static function decode( string $bytes, int &$used = 0 ) {
		$cbor        = new self();
		$cbor->bytes = $bytes;
		$item        = $cbor->item( 0 );
		$used        = $cbor->at;
		return $item;
	}

	/**
	 * Reads one item.
	 *
	 * @param int $depth How deep the item nests; a map or array deeper than 8 is refused.
	 * @return mixed
	 * @throws \RuntimeException On malformed bytes.
	 */
	private function item( int $depth ) {
		if ( $depth > 8 ) {
			throw new \RuntimeException( 'CBOR nests too deep' );
		}
		$head  = $this->byte();
		$major = $head >> 5;
		$low   = $head & 0x1f;
		switch ( $major ) {
			case 0:
				return $this->length( $low );
			case 1:
				return -1 - $this->length( $low );
			case 2:
			case 3:
				return $this->take( $this->length( $low ) );
			case 4:
				$count = $this->length( $low );
				$list  = array();
				for ( $i = 0; $i < $count; $i++ ) {
					$list[] = $this->item( $depth + 1 );
				}
				return $list;
			case 5:
				$count = $this->length( $low );
				$map   = array();
				for ( $i = 0; $i < $count; $i++ ) {
					$key = $this->item( $depth + 1 );
					if ( ! is_int( $key ) && ! is_string( $key ) ) {
						throw new \RuntimeException( 'CBOR map key is not an integer or a string' );
					}
					$map[ $key ] = $this->item( $depth + 1 );
				}
				return $map;
			case 7:
				if ( 20 === $low ) {
					return false;
				}
				if ( 21 === $low ) {
					return true;
				}
				if ( 22 === $low ) {
					return null;
				}
				throw new \RuntimeException( 'CBOR simple value not supported' );
			default:
				throw new \RuntimeException( 'CBOR major type not supported' );
		}
	}

	/**
	 * The length or value the head's low bits give, read from the following bytes when they say so.
	 *
	 * @param int $low The head's low five bits.
	 * @return int
	 * @throws \RuntimeException On an indefinite length or a reserved value.
	 */
	private function length( int $low ): int {
		if ( $low < 24 ) {
			return $low;
		}
		$sizes = array(
			24 => 1,
			25 => 2,
			26 => 4,
			27 => 8,
		);
		if ( ! isset( $sizes[ $low ] ) ) {
			throw new \RuntimeException( 'CBOR indefinite lengths are not supported' );
		}
		$value = 0;
		for ( $i = 0; $i < $sizes[ $low ]; $i++ ) {
			$value = ( $value << 8 ) | $this->byte();
		}
		if ( $value < 0 ) {
			throw new \RuntimeException( 'CBOR value is too large' );
		}
		return $value;
	}

	/**
	 * The next byte.
	 *
	 * @return int
	 * @throws \RuntimeException When the bytes end first.
	 */
	private function byte(): int {
		if ( $this->at >= strlen( $this->bytes ) ) {
			throw new \RuntimeException( 'CBOR ends early' );
		}
		return ord( $this->bytes[ $this->at++ ] );
	}

	/**
	 * The next so many bytes.
	 *
	 * @param int $count How many.
	 * @return string
	 * @throws \RuntimeException When the bytes end first.
	 */
	private function take( int $count ): string {
		if ( $count > strlen( $this->bytes ) - $this->at ) {
			throw new \RuntimeException( 'CBOR ends early' );
		}
		$out       = substr( $this->bytes, $this->at, $count );
		$this->at += $count;
		return $out;
	}
}

// PHPCS keeps a phpcs:set for the files after this one, so the domain goes back to Riff's here.
// phpcs:set WordPress.WP.I18n text_domain[] riff
