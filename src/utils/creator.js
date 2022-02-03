/**
 * Make pack
 */

import * as zip from '@zip.js/zip.js'

import { get } from 'svelte/store'

import { loadResourcesList, loadResource } from 'src/api/resources.js'
import {
	clearSelectedPacks,
	selectedPacksOrder,
	makeProgress,
	makeStatus,
} from 'src/stores/packs.js'
import { hashCode } from 'src/utils/hash.js'

export async function makePack(pack_format) {
	const selectedPacks = Array.from(get(selectedPacksOrder))

	makeStatus.set('download')

	let resources = await makeResourcesList(selectedPacks)
	let blobs = await loadImages(resources)

	makeStatus.set('zip')

	downloadZip(...(await makeZip(blobs, selectedPacks, pack_format)))

	makeStatus.set('none')
	clearSelectedPacks()
}

async function makeResourcesList(selected) {
	let resources = new Set(),
		resources_files = new Set(),
		path,
		returned

	for (let pack_path of selected) {
		// hardcode a little
		path = 'resourcepacks/' + pack_path

		returned = await loadResourcesList(path)

		// not store pack if resulting resources already has
		// resources with the same names
		if (returned.files.some((f) => resources_files.has(f))) {
			continue
		}

		returned.files.forEach((file) => {
			resources.add({
				name: file,
				path: `${path}/${file}`,
			})
			resources_files.add(file)
		})
	}

	return resources
}

async function loadImages(resources) {
	let blobs = []

	makeProgress.set(0)
	const downloadCount = resources.size
	let i = 0

	for (let file of resources.values()) {
		blobs.push({
			name: file.name,
			content: await loadResource(file.path),
		})

		i += 1
		makeProgress.set(Math.floor((i * 100) / downloadCount))
	}

	makeProgress.set(-1)

	return blobs
}

async function makeZip(blobs, selected, pack_format) {
	makeProgress.set(0)

	// 2 files additionally
	const downloadCount = blobs.length + 2
	let i = 0

	const blobWriter = new zip.BlobWriter('application/zip')
	const writer = new zip.ZipWriter(blobWriter)

	// resources
	for (let blob of blobs) {
		await writer.add(blob.name, new zip.BlobReader(blob.content))

		i += 1
		makeProgress.set(Math.floor((i * 100) / downloadCount))
	}

	// pack.mcmeta
	const mcmeta = JSON.stringify({
		pack: {
			pack_format,
			description: 'Minecraft tweaks',
		},
	})

	await writer.add('pack.mcmeta', new zip.TextReader(mcmeta))

	makeProgress.set(Math.floor(((i + 1) * 100) / downloadCount))

	// info about archive
	const packsString = selected.map((p) => 'rp/' + p).join(';')
	const infoString = packsString
	await writer.add('info.txt', new zip.TextReader(infoString))

	makeProgress.set(-1)

	await writer.close()
	return [blobWriter.getData(), hashCode(infoString)]
}

function downloadZip(blob, hash = '') {
	const a = document.createElement('a')
	a.setAttribute('download', `tweaks_h${hash}.zip`)
	a.href = URL.createObjectURL(blob)
	a.click()
}
