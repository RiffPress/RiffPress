# Proposal: Media pickers for track artwork and video pairing

Issue: [#345](https://github.com/RiffPress/RiffPress/issues/345)

This proposal covers the interaction and compatibility decisions for replacing the
Media Library's artwork and video URL text fields with WordPress media pickers.
It does not implement the controls or change current sanitization behavior.

## Existing behavior

`Riff\Media::fields()` adds an **Artwork** field to audio and video attachments and
a **Video version** field to audio attachments. Both are currently text inputs.
`Riff\Media::save()` accepts either an attachment URL or a numeric attachment ID,
then validates the attachment type and stores the image as the file's featured
image or the video ID in `_riff_video`.

The current save path clears the stored value for both an empty value and an
invalid non-empty value. `test_saving_accepts_an_address_or_an_id_and_clears_on_empty`
also asserts that an external video address clears an existing pairing;
`test_artwork_is_the_files_featured_image_set_from_an_address_or_an_id` asserts
that a non-image ID clears artwork. These are tested behaviors and must not be
silently reclassified as regressions.

Separately, `_riff_video` is registered as integer REST meta with
`sanitize_video()` as its sanitizer. Invalid REST values therefore normalize to
`0`; sanitization does not currently return a field-level validation error or
preserve the previous value. REST writes are also gated by the existing
`edit_post` capability callback.

## Proposed interaction

- Use the native WordPress Media Library selection UI for artwork on audio and
  video attachments. Limit selection to image attachments.
- Offer video selection only on audio attachments and limit it to video
  attachments.
- Show the current selected item's preview and provide **Replace** and an
  explicit **Remove** action. Removal should be visibly distinct from opening
  the picker and should clear only the field the user removes.
- Support both the attachment edit screen and the attachment details in the
  Media Library modal. Controls should have labels, keyboard-operable actions,
  and localized status/validation feedback; do not depend on color or preview
  alone to communicate selection state.
- Keep the existing storage model and permissions: artwork remains the
  attachment's featured image, and video pairing remains `_riff_video`.
- Keep accepting existing saved values and manual URL or numeric-ID entry.
  Picker selections should resolve to attachment IDs and pass through the same
  image/video type checks before saving. A URL outside the Media Library is not
  a valid picker selection.

## Recommended validation policy

For the interactive attachment form, distinguish a deliberate removal from an
invalid non-empty value. Recommend that an explicit **Remove** action clears the
selection, while invalid non-empty input retains the saved selection and reports
a field error. This avoids making a typo or a wrong-media-type selection look
like a successful removal. Preserve the current blank-value behavior only if
maintainers want blank legacy text fields to continue to mean removal; make that
choice explicit and test it.

Do not change the shared sanitizers as an incidental part of adding picker UI.
The REST metadata path has no attachment-form field to annotate, and its current
sanitizer maps invalid values to `0`. If REST writes should reject invalid values
or preserve the previous selection instead, decide and implement that as a
separate API validation policy rather than assuming the form's field-error
behavior carries over.

## Player and API effects

The picker should only change how administrators select and remove attachments.
On a successful save, existing track construction already reads the attachment
thumbnail for artwork and `_riff_video` for an audio track's video version.
REST and GraphQL expose the resulting track data through the shared track
builder; the player uses the artwork and video source from that track. Tests
should therefore verify the saved attachment data reaches the track output,
without introducing new track keys or changing the storage schema.

## Decisions required before implementation

1. **Invalid form input:** Approve the recommendation to preserve the current
   selection and show a field error for invalid non-empty input, or retain the
   current clearing behavior?
2. **Blank form input:** Should a blank legacy text value continue to clear the
   field, or should clearing require the explicit **Remove** action?
3. **REST writes:** Should invalid REST meta writes keep normalizing to `0`, or
   should they be rejected or otherwise prevented from clearing a valid saved
   pairing? The recommendation is to leave REST behavior unchanged in the
   picker-only change.
4. **Entry method:** Should manual URL and numeric-ID entry remain available
   alongside the picker? The recommendation is yes, to preserve the supported
   workflow.

## Acceptance and test coverage

After the decisions above are approved, implementation should cover:

- Image selection for audio and video attachments, and video selection only for
  audio attachments.
- Replacing and explicitly removing artwork and video pairing, including
  saving and reopening each admin context.
- Valid attachment URLs and numeric IDs, plus each approved blank and invalid
  input policy.
- REST metadata writes under the separately approved API policy.
- Resulting artwork and video values in track output and the player-facing
  track API.
- Keyboard operation, accessible names, localized feedback, and editor
  interaction coverage.
