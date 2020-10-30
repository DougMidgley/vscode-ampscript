'use strict';

import { AxiosRequestConfig } from 'axios';
import { isNullOrUndefined } from 'util';
import * as vscode from 'vscode';
import { Auth } from './core';
import { getEntityType, MCUri, delay } from '../utils';
import { Metadata } from './metadata';


export class Query extends Metadata {
    public filesCache: Map<string, any> = new Map<string, any>();
    constructor() {
        super();

    }

    async getSubdirectoriesByDirectoryId(connection: Auth, directoryId: number): Promise<Array<any>> {

        const config: AxiosRequestConfig = {
            method: 'get',
            url: 'automation/v1/folders',
            params: {
                '$filter': 'categorytype%20eq%20queryactivity'
            }
        };

        const data: any = await connection.restRequest(config);

        return data.items.filter((item: any) => item.parentId == directoryId);
    }

    async getMetadataByDirectoryId(connection: Auth, mcUri: MCUri): Promise<Array<any>> {

        if (isNullOrUndefined(mcUri.id)) {
            throw new Error('getMetadataByDirectoryId: directoryId is undefined');
        }
        if (mcUri.id == 0) return [];

        const config: AxiosRequestConfig = {
            method: 'get',
            url: `automation/v1/queries/category/${mcUri.id}`,
            params: {
                '$page': 1,
                '$pageSize': 25,
                'retrievalType': 1
            }
        };
        this;
        const data: any = await connection.restRequest(config);
        // return data.items as Array<any>

        return (data.items as Array<any>).map(a => new Content(a, mcUri.globalPath));
    }

    async updateMetadata(connection: Auth, metadata: any): Promise<any> {
        const config: AxiosRequestConfig = {
            method: 'patch',
            url: `automation/v1/queries/${metadata.queryDefinitionId}`,
            data: metadata
        };

        const data: any = await connection.restRequest(config);

        return data;
    }

    async getMetadataById(connection: Auth, metadataId: string): Promise<any> {
        const config: AxiosRequestConfig = {
            method: 'get',
            url: `automation/v1/queries/${metadataId}`
        };

        const data: any = await connection.restRequest(config);
        return data;
        // todo:  return new MCAsset(data);
    }

    async runQuery(mcUri: MCUri, connection: Auth) {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Running Query',
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User canceled the long running operation");
            });
            const key = mcUri.globalPath.replace('.query-meta.json', '').replace('.sql', '');
            const file = this.filesCache.get(key);
            if (file) {
                const config: AxiosRequestConfig = {
                    method: 'post',
                    url: `automation/v1/queries/${file.id}/actions/start`
                };
                await connection.restRequest(config);
            }
            let retries = 20;
            let complete = false;
            const delayTime = 10000;
            do {
                await delay(delayTime);
                progress.report({ increment: 100 / retries, message: `Attempts remaining ${retries} @ ${delayTime / 1000} Seconds` });
                const running = await this.checkRunning(file.id, connection);
                if (running === false) {
                    progress.report({ increment: 100, message: `Complete` });
                    complete = true;
                } else {
                    retries--;
                    complete = true;
                }

            } while (!complete && retries > 0)
            if (complete) {
                const content = this.filesCache.get(key).content;
                const sampleData = await this.getDataByKey(content.targetKey, connection);
                const selection = await vscode.window.showInformationMessage(`${sampleData.customObjectKey} returned ${sampleData.count} Results`, 'Open');
                if (selection === 'Open') {
                    vscode.env.openExternal(`https://mc.s7.exacttarget.com/contactsmeta/admin.html#admin/data-extension/${content.targetId}/properties/` as unknown as vscode.Uri);
                }
            } else {
                vscode.window.showWarningMessage('Query check timeed out, check Marketing Cloud to see results');
            }

            return true;
        });
    }

    async checkRunning(id: string, connection: Auth) {
        const config: AxiosRequestConfig = {
            method: 'get',
            url: `automation/v1/queries/${id}/actions/isrunning`
        };
        const data: any = await connection.restRequest(config);
        return data.isRunning;
    }

    async getDataByKey(key: string, connection: Auth) {
        const config: AxiosRequestConfig = {
            method: 'get',
            url: `data/v1/customobjectdata/key/${key}/rowset`
        };
        const data: any = await connection.restRequest(config);
        console.log(data);
        return data;

    }

    async readDirectories(uri: vscode.Uri, connection: Auth) {
        const mcUri = new MCUri(uri.authority, uri.path);

        if (getEntityType(mcUri) != vscode.FileType.Directory) {
            throw vscode.FileSystemError.FileNotFound();
        }

        const result: [string, vscode.FileType][] = [];


        const directoryId = await this.getDirectoryIdByPath(connection, mcUri);
        mcUri.setId(directoryId);

        const promises = await Promise.all([
            this.getSubdirectoriesByDirectoryId(connection, directoryId),
            this.getMetadataByDirectoryId(connection, mcUri),
        ]);

        const subsfolders = promises[0] as Array<any>;
        const metadata = promises[1] as Array<any>;
        // add folders to current directory
        subsfolders.forEach(subfolder => {
            result.push([subfolder.name as string, vscode.FileType.Directory]);
        });
        // add files to current directory
        for (const item of metadata) {
            const name = item.name;
            const path = mcUri.globalPath + (mcUri.globalPath.endsWith("/") ? "" : "/") + name;
            this.filesCache.set(path, item);
            // save json file with type in name for future use
            result.push([item.name + '.query-meta.json', vscode.FileType.File]);
            // save sql
            result.push([item.name + '.sql', vscode.FileType.File]);
        }
        return result;
    }

    async writeFile(content: Uint8Array, mcUri: MCUri, connection: Auth) {
        // const metadata = this.filesCache.get(mcUri.globalPath);
        const key = mcUri.globalPath.replace('.query-meta.json', '').replace('.sql', '');
        const file = this.filesCache.get(key);
        const str = new TextDecoder("utf-8").decode(content);
        let item;
        if (mcUri.globalPath.endsWith('query-meta.json')) {
            item = JSON.parse(str);

        } else if (mcUri.globalPath.endsWith('.sql')) {
            file.content.queryText = str;
            item = file.content;
        }

        const result = await this.updateMetadata(connection, item);
        if (file.name != item.name) {
            const newPath = mcUri.globalPath.replace(file.name, item.name);
            this.filesCache.delete(key);
            // reset name need to update in file system
            return newPath;
        } else {
            this.filesCache.set(key, new Content(item, file.path));
        }
        return;


        // const savedAsset = await this.getMetadataById(connection, metadata.id);
        // throw vscode.FileSystemError.FileNotFound();


    }

    readFile(path: string): Uint8Array {
        const file = this.filesCache.get(path.replace('.query-meta.json', '').replace('.sql', ''));
        if (file) {
            return file.getData(path);
        }
        throw new Error('File not found at ' + path);
    }
}


export class Content {
    // public readonly path: string;
    private content: string;
    private isChanged = false;
    public isJsonContent = false;
    public id: string;
    public name: string;
    public sql: string;
    public path: string;
    // name: string, path: string, content: string, isJsonContent: boolean = false
    constructor(item: any, path: string) {
        this.id = item.queryDefinitionId;
        this.name = item.name;
        this.content = item;
        this.sql = item.queryText;
        this.path = path;
        // this.isJsonContent = isJsonContent;
    }

    public hasChanges(): boolean {
        return this.isChanged;
    }

    public getData(path: string): Uint8Array {
        if (path.endsWith('query-meta.json')) {
            return new TextEncoder().encode(JSON.stringify(this.content, null, 2));
        } else if (path.endsWith('.sql')) {
            return new TextEncoder().encode(this.sql);
        }
        throw new Error('Unsupported file type on Query');

    }

    public getContent(): string {
        return this.content;
    }
    public setData(data: Uint8Array): void {
        this.setContent(new TextDecoder("utf-8").decode(data));
    }

    public setContent(content: string): void {
        this.content = content;
        this.isChanged = true;
    }
    public resetChanges(): void {
        this.isChanged = false;
    }
}