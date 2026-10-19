/**
 * Which area of WordPress an API belongs to, from the core file it is defined or fired in.
 *
 * Core has no machine-readable grouping of its APIs, but its files are grouped by feature, so the
 * path is a good stand-in. The first matching rule wins; anything left over is "General".
 */

const FILE_RULES = [
	[ /(^|[/-])abilit(y|ies)/, 'Abilities' ],
	[ /wp-admin\/includes\/(template|plugin|screen|class-wp-screen|dashboard|misc|menu)\.php$/, 'Admin' ],
	[ /interactivity-api/, 'Interactivity API' ],
	[ /html-api\//, 'HTML API' ],
	[ /script-modules|class-wp-script-modules/, 'Script Modules' ],
	[ /block-bindings/, 'Block Bindings' ],
	[ /rest-api|json-schema\.php$/, 'REST API' ],
	[ /ai-client|connector/, 'AI Client' ],
	[ /fonts\/|fonts\.php$/, 'Fonts' ],
	[ /theme-json|global-styles|style-engine|class-wp-duotone/, 'Global Styles' ],
	[ /blocks?\.php$|blocks\/|block-supports\/|block-patterns|block-template|block-editor\.php$|class-wp-block|blocks-|class-wp-icon|icons\.php$/, 'Blocks' ],
	[ /media|image|class-wp-oembed|embed|post-thumbnail|class-avif-info|ID3|video|audio/, 'Media' ],
	[ /l10n|pomo\/|class-wp-locale|textdomain|translation|locale\.php$/, 'i18n' ],
	[ /meta\.php$|class-wp-meta-query|metadata-lazyloader|meta-boxes/, 'Meta' ],
	[ /option\.php$|options\.php$/, 'Options' ],
	[ /user|capabilities|class-wp-role|application-passwords|session|pluggable/, 'Users and auth' ],
	[ /rewrite|canonical|link-template|class-wp\.php$|class-wp-matchesmapregex/, 'Rewrite and permalinks' ],
	[ /cron/, 'Cron' ],
	[ /http/, 'HTTP' ],
	[ /cache/, 'Cache' ],
	[ /formatting|kses|utf8|compat/, 'Formatting and sanitization' ],
	[ /script-loader|wp-scripts|wp-styles|class-wp-dependenc|class\.wp-|speculati|view-transitions/, 'Scripts and styles' ],
	[ /taxonom|category|class-wp-term|class-wp-tax-query/, 'Taxonomies' ],
	[ /comment/, 'Comments' ],
	[ /post|revision|query\.php$|class-wp-query|class-wp-date-query|bookmark/, 'Posts and queries' ],
	[ /nav-menu|menu/, 'Menus' ],
	[ /widget/, 'Widgets' ],
	[ /customize/, 'Customizer' ],
	[ /site-health/, 'Site Health' ],
	[ /ms-|class-wp-network|class-wp-site|network/, 'Multisite' ],
	[ /sitemaps/, 'Sitemaps' ],
	[ /shortcode/, 'Shortcodes' ],
	[ /plugin|class-wp-hook/, 'Hooks and plugins' ],
	[ /theme|template/, 'Themes and templates' ],
	[ /feed|rss|atom/, 'Feeds' ],
	[ /update|upgrade|class-wp-automatic|class-core-upgrader/, 'Updates' ],
	[ /privacy|personal-data/, 'Privacy' ],
	[ /wp-admin\//, 'Admin' ],
];

// Attachments are posts, so most of their API lives in post.php; the name says where it belongs.
const NAME_RULES = [ [ /attachment|thumbnail/i, 'Media' ] ];

/**
 * The area of an API, from its name when that is unambiguous, otherwise from its core file.
 *
 * @param {string} file   Path relative to the WordPress root, like `wp-includes/media.php`.
 * @param {string} [name] The function, class or hook name.
 * @return {string} The area.
 */
function areaOf( file, name = '' ) {
	for ( const [ re, area ] of NAME_RULES ) {
		if ( re.test( name ) ) {
			return area;
		}
	}
	for ( const [ re, area ] of FILE_RULES ) {
		if ( re.test( file ) ) {
			return area;
		}
	}
	return 'General';
}

// The JavaScript packages that belong with a PHP area; the rest are "Editor packages".
const PACKAGE_AREAS = {
	'@wordpress/interactivity': 'Interactivity API',
	'@wordpress/interactivity-router': 'Interactivity API',
	'@wordpress/abilities': 'Abilities',
	'@wordpress/core-abilities': 'Abilities',
	'@wordpress/api-fetch': 'REST API',
	'@wordpress/url': 'REST API',
	'@wordpress/i18n': 'i18n',
	'@wordpress/hooks': 'Hooks and plugins',
	'@wordpress/plugins': 'Hooks and plugins',
	'@wordpress/media-utils': 'Media',
	'@wordpress/blob': 'Media',
	'@wordpress/blocks': 'Blocks',
	'@wordpress/block-editor': 'Blocks',
	'@wordpress/block-library': 'Blocks',
	'@wordpress/server-side-render': 'Blocks',
	'@wordpress/block-serialization-default-parser': 'Blocks',
	'@wordpress/a11y': 'Accessibility',
	'@wordpress/style-engine': 'Global Styles',
	'@wordpress/global-styles-engine': 'Global Styles',
	'@wordpress/preferences': 'Users and auth',
	'@wordpress/widgets': 'Widgets',
	'@wordpress/customize-widgets': 'Customizer',
	'@wordpress/edit-widgets': 'Widgets',
	'@wordpress/date': 'i18n',
};

const packageArea = ( name ) => PACKAGE_AREAS[ name ] || 'Editor packages';

module.exports = { areaOf, packageArea };
