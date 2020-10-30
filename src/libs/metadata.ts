import { isNullOrUndefined } from 'util';
import * as vscode from 'vscode';
import { Auth } from './core';
import { MCUri } from '../utils';
export class Metadata {
	private directoriesCache: Map<string, number>;

	constructor() {
		this.directoriesCache = new Map<string, number>();
	}


	async getDirectoryIdByPath(connection: Auth, uri: MCUri): Promise<number> {
		try {
			if (['/'].includes(uri.localPath)) {
				return 0;
			}
			if (!isNullOrUndefined(this.directoriesCache.get(uri.globalPath))) {
				return this.directoriesCache.get(uri.globalPath) || 0;
			}
			const parentDirId = await this.getDirectoryIdByPath(connection, MCUri.getParent(uri));
			if (isNullOrUndefined(parentDirId)) {
				console.log(parentDirId, 'null error');
			}
			const parentSubdirectories = await this.getSubdirectoriesByDirectoryId(connection, parentDirId);
			const found = parentSubdirectories.find(parentSubdirectory => parentSubdirectory.name === uri.name);
			if (!isNullOrUndefined(found)) {
				this.directoriesCache.set(uri.globalPath, found.id || found.categoryId);
				return found.id || found.categoryId;
			}
			throw new Error(`Path not found: ${uri.globalPath}`);
		} catch (ex) {
			console.error(ex);
			throw ex;
		}

	}

	async getSubdirectoriesByDirectoryId(connection: Auth, directoryId: number): Promise<Array<any>> {
		throw new Error(`getSubdirectoriesByDirectoryId not implemented for this type`);
	}

	private getEntityType(uri: MCUri) {
		let blocked: Array<string> = ['/pom.xml', '/node_modules'];

		if (blocked.includes(uri.localPath.toLowerCase())) {
			return vscode.FileType.Unknown;
		}

		if (uri.localPath.startsWith('/.')) {
			return vscode.FileType.Unknown;
		}

		if (uri.localPath.endsWith('.amp') || uri.localPath.endsWith('.ampscript')) {
			return vscode.FileType.File;
		}

		if (uri.localPath.endsWith('.json')) {
			return vscode.FileType.File;
		}

		if (uri.localPath == '/' || !uri.localPath.startsWith('/.')) {
			return vscode.FileType.Directory;
		}

		return vscode.FileType.Unknown;
	}
}