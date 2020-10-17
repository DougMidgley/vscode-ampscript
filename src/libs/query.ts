'use strict';

import axios, { AxiosRequestConfig } from 'axios';
export class query {


	public static async getQueries(mid: string, execRestApi: Function): Promise<Array<Object>> {

        let page : number= 1;
        const pageSize : number = 50;
        let moreResults : boolean= false;
        let results : Array<any> = [];
        try{
            do{
                let config: AxiosRequestConfig = {
                    method: 'get',
                    url: `automation/v1/queries?$page=${page}&$pageSize=${pageSize}`
                }
                const data: any = await execRestApi(mid, config);
                if(data.items && data.items.length>0){
                    results.push(...data.items);
                }
                if(results.length=(page * pageSize)){
                    moreResults = true;
                } else{
                    page++;
                }
    
            } while (moreResults)
        } catch(ex){
            console.error(ex);
        }

		return results;
	}
}
