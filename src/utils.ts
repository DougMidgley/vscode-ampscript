import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class ConnectionManagerMessage {
	public action: string = '';
	public content: any = null;
}

export class Connection {
	public authBaseUri: string = '';
	public name: string = '';
	public account_id: string = '';
	public client_id: string = '';
	public client_secret: string = '';
	public grant_type: string = '';
}

export class ConnectionManagerPanel {
	private panel: vscode.WebviewPanel | null = null;

	public onMessageReceived: (message: any) => void = () => null;

	public open(webviewPath: string): void {
		const webviewPathUri = vscode.Uri.file(webviewPath);
		const indexPath = path.join(webviewPathUri.fsPath, 'index.html');

		this.panel = vscode.window.createWebviewPanel(
			'mcfs_connection_manager',
			'MCFS Connection Manager',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [webviewPathUri]
			}
		);

		this.panel?.webview.onDidReceiveMessage((message: any) => {
			this.onMessageReceived(message);
		});

		let content: string = '';

		fs.readFile(indexPath, (err, data) => {
			if (err) {
				content = `Error: unable to open confirguration manager using path ${indexPath}. ${err.toString()}`;
				return;
			}
			else {
				content = data
					.toString()
					.replace(/\/(css|js|assets|img)\//g, `${this.panel?.webview.asWebviewUri(webviewPathUri)}/$1/`);
			}

			if (this.panel) {
				this.panel.webview.html = content;
			}
		});
	}

	public close() {
		this.panel?.dispose();
	}

	public postMessage(message: ConnectionManagerMessage): void {
		this.panel?.webview.postMessage(message);
	}
}

export class Utils {
	public static isMcfsInitialized() {
		return vscode.workspace
			&& vscode.workspace.workspaceFolders
			&& vscode.workspace.workspaceFolders.findIndex(v => v.uri.scheme === 'mcfs') >= 0
			|| false;
	}

	public static readJSON(path: string): Promise<any> {
		return new Promise((resolve, reject) => {
			fs.readFile(require.resolve(path), (err, data) => {
				if (err) {
					reject(err)
				}
				else {
					resolve(JSON.parse(data.toString('utf-8')));
				}
			})
		});
	}
}

export function getEntityType(uri: MCUri) {
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
	if (uri.localPath.endsWith('.sql')) {
		return vscode.FileType.File;
	}

	if (uri.localPath == '/' || !uri.localPath.startsWith('/.')) {
		return vscode.FileType.Directory;
	}

	return vscode.FileType.Unknown;
}

export class MCUri {
	public readonly mid: string;
	public readonly name: string;
	public readonly globalPath: string;
	public readonly localPath: string;
	public readonly parts: Array<string> = [];
	public id?: number;

	constructor(mid: string, localPath: string) {
		this.mid = mid;
		this.name = path.basename(localPath);
		this.localPath = localPath.replace(/\\/gi, '/');
		this.globalPath = path.join('/', this.mid, this.localPath).replace(/\\/gi, '/');
	}

	public static getParent(uri: MCUri): MCUri {
		let parts: Array<string> = uri.localPath.split('/');
		parts.pop();
		return new MCUri(uri.mid, parts.join('/') || '/');
	}

	public setId(directoryId: number) {
		this.id = directoryId;

	}
}
export function delay(time: number) {
	return new Promise((resolve) => {
		setTimeout(() => resolve(time), time);
	});
}