# Verifying a release

Every zip on a RiffPress GitHub release, `riff.zip` and each extension's (`riff-lyrics.zip`, `riff-chords.zip`, `riff-sign-in.zip`, `riff-sing.zip`), carries a [GitHub artifact attestation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations). It is a signed record of the zip's SHA-256, the commit it was built from and the workflow run that built it, made by `release-please.yml` before the zip is uploaded. Releases made before the workflow began attesting have none. A host can check a zip against it before installing, and anyone can rebuild the zip and get the same bytes.

## Check a zip

With the [GitHub CLI](https://cli.github.com/):

```sh
gh attestation verify riff.zip --repo RiffPress/RiffPress
```

It passes only if the file's hash was attested by a workflow in RiffPress/RiffPress. To hold it to the release workflow on `main` as well, so a zip built by any other workflow fails:

```sh
gh attestation verify riff.zip \
  --repo RiffPress/RiffPress \
  --signer-workflow RiffPress/RiffPress/.github/workflows/release-please.yml \
  --source-ref refs/heads/main
```

Add `--format json` to read the commit the zip was built from (`.[0].verificationResult.signature.certificate.sourceRepositoryDigest`) and the run that built it. The attestations are also listed at [github.com/RiffPress/RiffPress/attestations](https://github.com/RiffPress/RiffPress/attestations), and `gh attestation download riff.zip --repo RiffPress/RiffPress` saves the [Sigstore](https://www.sigstore.dev/) bundle for any Sigstore client to check.

A host that installs from WordPress.org gets the same plugin, but WordPress.org rebuilds its own zip, so its bytes and hash differ from the release's. Verify the GitHub release's zip.

## Rebuild a zip

`.github/scripts/build-zip.sh` builds every release zip, and from the same commit it makes the same bytes on any machine: each file gets the commit's time and the same mode, the files go in byte order, and the zip leaves out owners and access times. To check a release, build it from its tag and compare (the tag here is an example; any release made since attestations began works):

```sh
git clone --depth 1 --branch riff-v6.5.0 https://github.com/RiffPress/RiffPress.git
cd RiffPress
bash .github/scripts/build-zip.sh riff
shasum -a 256 build/riff.zip
gh release download riff-v6.5.0 --repo RiffPress/RiffPress --pattern riff.zip --output - | shasum -a 256
```

The two hashes match when the rebuild runs where the release did, on Ubuntu 24.04 with its Info-ZIP `zip`. Another `zip`, or another version of the zlib it compresses with, can write different bytes for the same files, so a hash from elsewhere may differ while each file inside matches. `release-attest.test.js` builds `riff.zip` twice, from checkouts made at different times, in different time zones and with different umasks, and fails if the hashes differ.

## What CI holds to

`.github/scripts/release-attest.js` reads every workflow and fails if a job uploads a zip to a release, or builds one with `build-zip.sh`, without an `actions/attest-build-provenance` step for that zip, pinned to a commit, run before the upload, with `id-token: write` and `attestations: write`. The Workflow Scripts Tests run it on every pull request that touches a workflow.
