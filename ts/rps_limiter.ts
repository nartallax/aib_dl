// very stupid rps limiter
// it may be better, but whatever
export class RpsLimiter {
	private lastRequestTime = 0
	private readonly msBetweenRequests: number
	constructor(limit: number) {
		this.msBetweenRequests = 1000 / limit
	}

	async waitPermissionForRequest(): Promise<void> {
		while(true){
			let now = Date.now()
			let timeDiff = now - this.lastRequestTime
			if(timeDiff >= this.msBetweenRequests){
				this.lastRequestTime = now
				return
			} else {
				await new Promise(ok => setTimeout(ok, timeDiff + 1))
			}
		}
	}
}