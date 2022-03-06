// import {promises as Fs} from "fs"

// export class DirController {
// 	constructor(readonly dir: string, readonly indexDigitsCount: number) {}

// 	async create(): Promise<void> {
// 		await Fs.mkdir(this.dir, {recursive: true})
// 	}

// 	async findNextUnoccupiedIndexFilename(): string {
// 		let list = await Fs.readdir(this.dir)
// 		let namesOnlyList = list.sort()
// 			.map(x => x.replace(/\.[^.]+$/, ""))
// 			.filter(x => x.length === this.indexDigitsCount && x.match(/^\d+$/))
// 			.sort()
// 	}


// }