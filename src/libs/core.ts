'use strict';

import axios, { AxiosRequestConfig } from 'axios';
import * as path from 'path';
import { isNullOrUndefined } from 'util';
export class APIException {
    public detail: string;
    public message: string;
    public type: string;
    public endpoint?: string;
    constructor(message: string, detail: string, endpoint?: string) {
        this.detail = detail;
        this.message = message;
        this.type = 'APIException';
        this.endpoint = endpoint;
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
    get(account_id: string) {
        if ((account_id.match(/^\d+$/g) === undefined || account_id.match(/^\d+$/g) === null)) {
            throw new Error("Incorrect MID");
        } else if (this.connections.get(account_id) === null) {
            throw new Error("Connection config has not been set");
        } else {
            return this.connections.get(account_id);
        }
    }

}

export class Auth {
    private readonly authBaseUri: string;
    private readonly authObj: object = {};
    private token?: Token;
    private expires?: Date;


    constructor(authBaseUri: string, account_id: number, client_id: string, client_secret: string) {
        this.authBaseUri = authBaseUri;
        this.authObj = { account_id, client_id, client_secret, grant_type: "client_credentials" }
    }

    async getToken(): Promise<Token> {

        if (this.expires == null || this.expires < new Date()) {
            await this.refreshToken();
        }
        if (isNullOrUndefined(this.token)) {
            throw new Error("getToken - token was not available");
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
            console.log('API: Refresh Token');
            this.token = response.data;
            const now = new Date().getTime();
            this.expires = new Date(now + (response.data.expires_in - 5) * 1000);
            return;
        } catch (ex) {
            throw new APIException('Connection Issue', ex.message, this.authBaseUri + 'v2/token');
        }
    }

    async restRequest(config: AxiosRequestConfig): Promise<any> {

        const requestToken: Token = await this.getToken();
        if (isNullOrUndefined(requestToken)) {
            throw new Error("Issue getting token for connection");
        }
        config.baseURL = requestToken.rest_instance_url;
        config.headers = {
            'Content-Type': 'application/json',
            'Authorization': `${requestToken.token_type} ${requestToken.access_token}`
        };
        try {
            console.log('API: REST Request');
            const response = await axios(config);
            return response.data;
        } catch (ex) {
            if (ex.response && ex.response.data && ex.response.data.errors) {
                throw new APIException('REST API call failed', ex.response.data.errors.map((e: any) => e.message), config.url);
            }
            throw new APIException('REST API call failed', ex.message, config.url);
        }
    }
}
interface Token {
    rest_instance_url: string;
    soap_instance_url: string;
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}