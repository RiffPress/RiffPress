/**
 * The connect window's form: sends the address to the main process, which finds the Listen page
 * and opens it, or answers with why it could not.
 */
const MESSAGES = {
	invalid: 'That doesn’t look like a web address.',
	insecure:
		'The site needs an https:// address. Plain http:// works only for a site on this computer.',
	unreachable:
		'Couldn’t reach that site. Check the address and your connection.',
	'not-riff':
		'Couldn’t find a Listen page there. Try the address of the Listen page itself, as your browser shows it.',
};

const form = document.querySelector( 'form' );
const input = form.querySelector( 'input' );
const button = form.querySelector( 'button' );
const error = document.getElementById( 'error' );

window.riffDesktop.current().then( ( address ) => {
	if ( address && ! input.value ) {
		input.value = address;
		input.select();
	}
} );

form.addEventListener( 'submit', async ( event ) => {
	event.preventDefault();
	error.textContent = '';
	button.disabled = true;
	button.textContent = 'Connecting…';
	const result = await window.riffDesktop.connect( input.value );
	button.disabled = false;
	button.textContent = 'Connect';
	if ( result && result.error ) {
		error.textContent = MESSAGES[ result.error ] || MESSAGES.unreachable;
		input.focus();
	}
} );
