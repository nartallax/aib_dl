import * as Http from "http"
import * as Https from "https"
import {log} from "log"
import {RpsLimiter} from "rps_limiter"


export class HttpClient {
	private readonly rpsLimiter: RpsLimiter
	constructor(
		readonly cookies: string,
		readonly rootUrl: string,
		readonly timeout: number,
		readonly retryCount: number,
		rpsLimit: number) {
		this.rpsLimiter = new RpsLimiter(rpsLimit)
	}

	async get(url: string): Promise<Buffer> {
		let tryLevel = 1
		while(true){
			await this.rpsLimiter.waitPermissionForRequest()
			try {
				return await this.getWithoutRequestCount(url)
			} catch(e){
				if(tryLevel >= this.retryCount || !(e instanceof Error)){
					throw e
				}
				log("Failed to load " + url + ": " + e.message + ". Will retry " + (this.retryCount - tryLevel) + " more time(s)")
				tryLevel++
			}
		}
	}

	getWithoutRequestCount(urlString: string): Promise<Buffer> {
		return new Promise((ok, bad) => {
			void ok
			try {
				let url = new URL(urlString, this.rootUrl)
				let lib = url.protocol.toLowerCase().startsWith("https") ? Https : Http
				let headers = {} as Record<string, string>
				if(this.cookies){
					headers["Cookie"] = this.cookies
				}
				let req = lib.request({
					host: url.host,
					username: url.username,
					password: url.password,
					path: url.pathname,
					search: url.search,
					headers, timeout: this.timeout
				})
				req.on("response", resp => {
					if(!resp.statusCode || resp.statusCode !== 200){
						bad("Bad HTTP code (" + resp.statusCode + ") for URL " + urlString)
						return
					}
					try {
						let chunks = [] as Buffer[]
						let len = 0
						resp.on("data", (data: Buffer) => {
							chunks.push(data)
							len += data.length
						})
						resp.on("end", () => {
							ok(Buffer.concat(chunks, len))
						})
						resp.on("error", e => bad(e))
					} catch(e){
						bad(e)
					}
				})
				req.on("error", e => bad(e))
				req.end()
			} catch(e){
				bad(e)
			}
		})
	}
}