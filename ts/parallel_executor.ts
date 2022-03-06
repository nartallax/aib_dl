import {Event} from "event"
import {log} from "log"

export class ParallelExecutor {
	constructor(readonly limit: number) {}

	async asyncMap<I, O>(items: I[], action: (value: I, index: number) => Promise<O>, onFailure: (e: Error, input: I) => void): Promise<O[]> {
		let result = [] as O[]
		let completedEvent = Event()
		let execCount = 0
		for(let i = 0; i < items.length; i++){
			if(execCount >= this.limit){
				await completedEvent.wait()
			}

			execCount++
			action(items[i]!, i).then(
				output => {
					result[i] = output
					execCount--
					completedEvent.fire()
				},
				e => {
					execCount--
					completedEvent.fire()
					if(!(e instanceof Error)){
						log("wtf: " + e)
					}
					onFailure(e, items[i]!)
				}
			)
		}

		while(execCount > 0){
			await completedEvent.wait()
		}

		return result
	}
}