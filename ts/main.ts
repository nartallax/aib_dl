import {CLI} from "cli"
import {HttpClient} from "http_client"
import * as Cheerio from "cheerio"
import {log} from "log"
import {ParallelExecutor} from "parallel_executor"
import {promises as Fs} from "fs"
import * as Path from "path"

let cliArgs = new CLI({
	helpHeader: "A tool to download images from anonymous imageboard threads",
	definition: {
		url: CLI.str({keys: "--url", definition: "URL of thread you want to download from"}),
		outDir: CLI.str({keys: "--out-dir", definition: "Path to directory to place images into"}),
		cookies: CLI.str({keys: "--cookies", definition: "Cookie header content. May be required to download from some places", default: ""}),
		linkCssExpression: CLI.str({keys: "--css", definition: "CSS selector that points to all the DOM nodes that we need to extract images from"}),
		domAttributeName: CLI.str({keys: "--attribute", definition: "Name of attribute that contains URL of picture"}),
		requestTimeout: CLI.double({keys: "--request-timeout", definition: "How long to wait before request retry, seconds", default: 180}),
		downloadThreads: CLI.int({keys: "--download-threads", definition: "How many simultaneous requests are allowed to run", default: 3}),
		rps: CLI.double({keys: "--rps", definition: "How many requests per second is allowed max", default: 1}),
		retryCount: CLI.int({keys: "--retry", definition: "How many retries are allowed for a single URL before give-up", default: 3}),
		failFast: CLI.bool({keys: "--fail-fast", definition: "If passed, first completely failed URL will also terminate the process"}),
		help: CLI.help({keys: ["--help", "-help", "-h", "--h"], definition: "Display help and exit."})
	}
}).parseArgs()

export async function main(): Promise<void> {
	try {
		await nestedMain()
	} catch(e){
		log(e instanceof Error ? e.stack || e.message : e + "")
		process.exit(1)
	}
}

async function nestedMain(): Promise<void> {

	let startTime = Date.now()
	let httpClient = new HttpClient(
		cliArgs.cookies,
		cliArgs.url,
		cliArgs.requestTimeout,
		cliArgs.retryCount,
		cliArgs.rps
	)
	let links = extractLinks((await httpClient.get(cliArgs.url)).toString("utf-8"))
	await Fs.mkdir(cliArgs.outDir, {recursive: true})

	// let digitsCount = Math.floor(Math.log10(links.length)) + 1
	let successCount = 0
	let skipCount = 0
	let totalBytesDownloaded = 0

	await new ParallelExecutor(cliArgs.downloadThreads).asyncMap(links, async(link, index) => {
		let fname = makeFilename(link, index)
		let fullFname = Path.resolve(cliArgs.outDir, fname)
		try {
			await Fs.stat(fullFname)
			log(`Skipping ${link}: file ${fname} already exists.`)
			skipCount++
			return
		} catch(e){
			if(!(e instanceof Error) || !("code" in e) || (e as {code: string}).code !== "ENOENT"){
				throw e
			}
		}

		let data = await httpClient.get(link)
		await Fs.writeFile(fullFname, data)
		totalBytesDownloaded += data.length
		successCount++
		log(`Downloaded ${link} into ${fname}: ${formatBytes(data.length)}`)
	}, (e, link) => {
		if(cliArgs.failFast){
			log(`Completely failed to download ${link}: ${e.message}. Exiting.`)
			process.exit(1)
		} else {
			log(`Completely failed to download ${link}: ${e.message}. Won't retry.`)
		}
	})

	let timeSpent = Math.ceil((Date.now() - startTime) / 1000)
	log(`Completed; downloaded ${successCount} out of ${links.length} (skipped ${skipCount}) in ${timeSpent}s, total effective data downloaded: ${formatBytes(totalBytesDownloaded)}, at ${formatBytes(totalBytesDownloaded / timeSpent)}/s`)

	// --cookies "usercode_auth=6e221cda355f35e53c5bf3c76308933e" --css "a.post__image-link" --attribute href --url "https://2ch.hk/r34/res/6.html" --out-dir ~/slowpoke/pr0n/masseffect
}


let safeUrl = cliArgs.url.replace(/[^a-zA-Z\d_-]/g, "_").replace(/_{2,}/g, "_")
function makeFilename(link: string, index: number): string {
	let ext = (link.match(/([^.]+)$/) || [])[0] || ""
	if(ext){
		ext = "." + ext
	}

	let indexStr = index + ""
	while(indexStr.length < 7){
		indexStr = "0" + indexStr
	}
	return safeUrl + "_" + indexStr + ext
}

let byteSizeNames = ["", "kb", "mb", "gb", "tb"]

function formatBytes(bytes: number): string {
	let i = 0
	while(bytes > 10 * 1024){
		bytes /= 1024
		i++
	}
	return Math.round(bytes) + byteSizeNames[i]!
}

function extractLinks(html: string): string[] {
	let result = [] as string[]
	let dom = Cheerio.load(html)
	let els = dom(cliArgs.linkCssExpression)
	log("Extracted " + els.length + " items by CSS expression")
	els.each((_, node) => {
		let el = dom(node)
		let attrVal = el.attr(cliArgs.domAttributeName)
		if(typeof(attrVal) === "string"){
			result.push(attrVal)
		}
	})
	log("Extracted " + result.length + " links")
	return result
}