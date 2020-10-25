import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Connections } from './libs/core';
import { Asset, MCAsset, MCAssetContent, MCAssetPart } from './libs/asset';
import { Query } from './libs/query';
import { getEntityType, MCUri } from './utils';
import { fstat } from 'fs';

export class MCFS implements vscode.FileSystemProvider {
	private asset: Asset;
	public query: Query;
	private connections: any;
	private rootDirectories: [string, vscode.FileType][] = [];


	constructor(connections: Connections) {
		this.connections = connections
		this.asset = new Asset();
		this.query = new Query();
	}

	stat(uri: vscode.Uri): vscode.FileStat {
		const type: vscode.FileType = getEntityType(new MCUri(uri.authority, uri.path));

		if (type == vscode.FileType.Unknown) {
			throw vscode.FileSystemError.FileNotFound();
		}

		return {
			type: type,
			mtime: Date.now(),
			size: 0,
			ctime: 0,
		};
	}

	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		console.log('read directory', uri.path);
		const results: [string, vscode.FileType][] = [];

		if (uri.path == '/' || uri.path.startsWith('/Content Builder')) {
			try {
				results.push(...(await this.asset.readDirectories(uri, this.connections.get(uri.authority))));
			} catch (err) {
				this.showError(`Unable to read directory "${uri.path}"`, err);
			}

		}
		if (uri.path == '/' || uri.path.startsWith('/Query')) {
			try {
				results.push(...(await this.query.readDirectories(uri, this.connections.get(uri.authority))));
			} catch (err) {
				this.showError(`Unable to read directory "${uri.path}"`, err);
			}

		}
		return results;


	}


	readFile(uri: vscode.Uri): Uint8Array {
		const mcUri = new MCUri(uri.authority, uri.path);
		let file;
		if (getEntityType(mcUri) == vscode.FileType.File) {
			if (mcUri.localPath.startsWith('/Query')) {

				return this.query.readFile(mcUri.globalPath);
			} else if (mcUri.localPath.startsWith('/Content Builder')) {
				file = this.asset.filesCache.get(mcUri.globalPath);
				if (file) {
					return file.getData();
				}
			}

		}

		throw vscode.FileSystemError.FileNotFound();
	}



	async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): Promise<any> {
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Running Deploy',
			cancellable: false
		}, async () => {
			const mcUri = new MCUri(uri.authority, uri.path);

			if (mcUri.name.indexOf('.readonly.') > 0) {
				throw vscode.FileSystemError.NoPermissions(uri);
			}
			try {
				let result;
				if (mcUri.localPath.startsWith('/Query')) {
					result = await this.query.writeFile(content, mcUri, this.connections.get(mcUri.mid));
				} else if (mcUri.localPath.startsWith('/Content Builder')) {
					result = await this.asset.writeFile(content, mcUri, this.connections.get(mcUri.mid));
				}
				if (result) {
					//force refresh of FS
					const p = path.dirname(uri.toString()) as unknown as vscode.Uri;
					this.rename(mcUri.globalPath as unknown as vscode.Uri, result as unknown as vscode.Uri, { overwrite: true });
					//this.readDirectory(p);

				}
				this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
				this.showSuccess('Deployed Successfully : ' + mcUri.name);
			}
			catch (err) {
				this.showError(`Unable to write to file "${mcUri.localPath}"`, err);
			}
			return;
		});

	}

	private showError(message: string, err: any) {
		if (err.detail) {
			vscode.window.showErrorMessage(message + ':' + err.detail.join(''));
		} else {
			vscode.window.showErrorMessage(message + ' Error details: ' + err.message);
		}

	}
	private showSuccess(message: string) {
		vscode.window.showInformationMessage(message);
	}




	/* NOT IMPLEMENTED */

	createDirectory(uri: vscode.Uri): void {
		throw new Error("CreateDirectory not implemented yet");

		let basename = path.posix.basename(uri.path);
		let dirname = uri.with({ path: path.posix.dirname(uri.path) });
		this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { type: vscode.FileChangeType.Created, uri });
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
		//throw new Error("Rename not implemented yet");

		this._fireSoon(
			{ type: vscode.FileChangeType.Deleted, uri: oldUri },
			{ type: vscode.FileChangeType.Created, uri: newUri }
		);
	}

	delete(uri: vscode.Uri): void {
		throw new Error("Delete not implemented yet");

		let dirname = uri.with({ path: path.posix.dirname(uri.path) });
		let basename = path.posix.basename(uri.path);
		this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { uri, type: vscode.FileChangeType.Deleted });
	}


	// --- manage file events

	private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	private _bufferedEvents: vscode.FileChangeEvent[] = [];
	private _fireSoonHandle?: NodeJS.Timer;

	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

	watch(_resource: vscode.Uri): vscode.Disposable {
		// ignore, fires for all changes...
		return new vscode.Disposable(() => { });
	}



	private _fireSoon(...events: vscode.FileChangeEvent[]): void {
		this._bufferedEvents.push(...events);

		if (this._fireSoonHandle) {
			clearTimeout(this._fireSoonHandle);
		}

		this._fireSoonHandle = setTimeout(() => {
			this._emitter.fire(this._bufferedEvents);
			this._bufferedEvents.length = 0;
		}, 5);
	}

	runQuery(uri: vscode.Uri) {

		let mcUri = new MCUri(uri.authority, uri.path);
		this.query.runQuery(mcUri, this.connections.get(uri.authority));


	}
}
