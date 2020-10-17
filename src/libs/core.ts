'use strict';

import axios, { AxiosRequestConfig } from 'axios';
import * as path from 'path';
import { isNullOrUndefined } from 'util';
export class APIException {
    public detail: string = "";
    public message: string = "";
    public type: string = "";
    constructor(message: string, detail: string) {
        this.detail = detail;
        this.message = message;
        this.type = 'APIException'
    }

}

export class MCUri {
	public readonly mid: string;
	public readonly name: string;
	public readonly globalPath: string;
	public readonly localPath: string;
	public readonly parts: Array<string> = [];

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
}

export class Connections {
    private connections: Map<string, any>;
    constructor() {
        this.connections = new Map<string, any>();
    }

    setConnections(connections: Array<any>) {
        connections.forEach(v =>
            this.connections.set(v.account_id, new Auth(v.authBaseUri, v.account_id, v.client_id, v.client_secret))
        );
    }
	async execRestApi(account_id: string , config: AxiosRequestConfig): Promise<any> {
        if (isNullOrUndefined(account_id.match(/^\d+$/g))) {
			throw new Error("Incorrect MID");
		}
		if (isNullOrUndefined(this.connections.get(account_id))) {
			throw new Error("Connection config has not been set");
		}
        const token = await this.connections.get(account_id).getToken();
		config.baseURL = token.rest_instance_url;
		config.headers = {
			'Content-Type': 'application/json',
			'Authorization': `${token.token_type} ${token.access_token}`
		};
		try {
			const response = await axios(config);
			return response.data;
		} catch (ex) {
			throw new APIException('REST API call failed', ex.message);
		}
	}
}

export class Auth {
    private readonly authBaseUri: string;
    private readonly authObj: object = {};
    private token?: Object;
    private expires?: Date;


    constructor(authBaseUri: string, account_id: number, client_id: string, client_secret: string) {
        this.authBaseUri = authBaseUri;
        this.authObj = { account_id, client_id, client_secret, grant_type: "client_credentials" }
    }

    async getToken() {
        
        if (this.expires == null || this.expires < new Date()) {
            await this.refreshToken();
        }
        return this.token;
    }
    async refreshToken() {
        try {
            const response = await axios({
                method: 'post',
                url: this.authBaseUri + 'v2/token',
                headers: { 'Content-Type': 'application/json' },
                data: this.authObj
            })
            this.token = response.data;
            const now = new Date().getTime();
            this.expires = new Date(now + (response.data.expires_in - 5) * 1000);
            return;
        } catch (ex) {
            throw new APIException('Connection Issue', ex.message);
        }
    }
}