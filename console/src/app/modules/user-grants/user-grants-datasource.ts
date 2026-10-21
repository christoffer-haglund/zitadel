import { DataSource } from '@angular/cdk/collections';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { Timestamp } from 'google-protobuf/google/protobuf/timestamp_pb';
import { BehaviorSubject, Observable } from 'rxjs';
import { ListMyUserGrantsResponse, UserGrant as AuthUserGrant } from 'src/app/proto/generated/zitadel/auth_pb';
import { ListUserGrantResponse } from 'src/app/proto/generated/zitadel/management_pb';
import {
  UserGrant as MgmtUserGrant,
  UserGrantProjectGrantIDQuery,
  UserGrantProjectIDQuery,
  UserGrantQuery,
  UserGrantUserIDQuery,
} from 'src/app/proto/generated/zitadel/user_pb';
import { AuthorizationService } from 'src/app/services/authorization.service';
import { GrpcAuthService } from 'src/app/services/grpc-auth.service';
import { ManagementService } from 'src/app/services/mgmt.service';

export enum UserGrantContext {
  NONE = 'none',
  AUTHUSER = 'authuser',
  USER = 'user',
  OWNED_PROJECT = 'owned',
  GRANTED_PROJECT = 'granted',
}

type UserGrantAsObject = AuthUserGrant.AsObject | MgmtUserGrant.AsObject;

// userGrantId returns the id of the role assignment, which the auth API returns as grantId.
export function userGrantId(grant: UserGrantAsObject): string {
  return 'id' in grant ? grant.id : grant.grantId;
}

export class UserGrantsDataSource extends DataSource<UserGrantAsObject> {
  public totalResult: number = 0;
  public viewTimestamp!: Timestamp.AsObject;

  public grantsSubject: BehaviorSubject<Array<UserGrantAsObject>> = new BehaviorSubject<Array<UserGrantAsObject>>([]);
  // End dates of the time-bound role assignments on the current page, by role assignment id.
  // The v1 API does not expose them, so they are looked up through the v2 API.
  public expirationDates: Map<string, Date> = new Map();
  private loadingSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public loading$: Observable<boolean> = this.loadingSubject.asObservable();

  constructor(
    private authService: GrpcAuthService,
    private userService: ManagementService,
    private authorizationService: AuthorizationService,
  ) {
    super();
  }

  public loadGrants(
    context: UserGrantContext,
    pageIndex: number,
    pageSize: number,
    data: {
      projectId?: string;
      grantId?: string;
      userId?: string;
    },
    queries?: UserGrantQuery[],
  ): void {
    switch (context) {
      case UserGrantContext.AUTHUSER:
        if (data && data.userId) {
          this.loadingSubject.next(true);
          const promise = this.authService.listMyUserGrants(pageSize, pageSize * pageIndex);
          this.loadResponse(promise);
        }
        break;
      case UserGrantContext.USER:
        if (data && data.userId) {
          this.loadingSubject.next(true);

          const userfilter = new UserGrantQuery();
          const ugUiq = new UserGrantUserIDQuery();
          ugUiq.setUserId(data.userId);
          userfilter.setUserIdQuery(ugUiq);

          if (queries) {
            queries.push(userfilter);
          } else {
            queries = [userfilter];
          }

          const promise = this.userService.listUserGrants(pageSize, pageSize * pageIndex, queries);
          this.loadResponse(promise);
        }
        break;
      case UserGrantContext.OWNED_PROJECT:
        if (data && data.projectId) {
          this.loadingSubject.next(true);

          const projectfilter = new UserGrantQuery();
          const ugPfq = new UserGrantProjectIDQuery();
          ugPfq.setProjectId(data.projectId);
          projectfilter.setProjectIdQuery(ugPfq);

          if (queries) {
            queries.push(projectfilter);
          } else {
            queries = [projectfilter];
          }

          const promise1 = this.userService.listUserGrants(pageSize, pageSize * pageIndex, queries);
          this.loadResponse(promise1);
        }
        break;
      case UserGrantContext.GRANTED_PROJECT:
        if (data && data.grantId && data.projectId) {
          this.loadingSubject.next(true);

          const grantfilter = new UserGrantQuery();

          const uggiq = new UserGrantProjectGrantIDQuery();
          uggiq.setProjectGrantId(data.grantId);
          grantfilter.setProjectGrantIdQuery(uggiq);

          const projectfilter = new UserGrantQuery();
          const ugPfq = new UserGrantProjectIDQuery();
          ugPfq.setProjectId(data.projectId);
          projectfilter.setProjectIdQuery(ugPfq);

          if (queries) {
            queries.push(grantfilter);
          } else {
            queries = [grantfilter];
          }

          const promise2 = this.userService.listUserGrants(pageSize, pageSize * pageIndex, queries);
          this.loadResponse(promise2);
        }
        break;
      default:
        this.loadingSubject.next(true);
        const promise3 = this.userService.listUserGrants(pageSize, pageSize * pageIndex, queries ?? []);
        this.loadResponse(promise3);
        break;
    }
  }

  private loadResponse(promise: Promise<ListUserGrantResponse.AsObject | ListMyUserGrantsResponse.AsObject>): void {
    promise
      .then(async (resp) => {
        if (resp.resultList) {
          this.expirationDates = await this.loadExpirationDates(resp.resultList.map(userGrantId));
          this.grantsSubject.next(resp.resultList);
        }
        this.loadingSubject.next(false);
        if (resp.details) {
          this.totalResult = resp.details.totalResult;
          if (resp.details.viewTimestamp) {
            this.viewTimestamp = resp.details.viewTimestamp;
          }
        }
      })
      .catch((error) => {
        console.error(error);
        this.grantsSubject.next([]);
        this.loadingSubject.next(false);
      });
  }

  private async loadExpirationDates(ids: string[]): Promise<Map<string, Date>> {
    const expirationDates = new Map<string, Date>();
    if (!ids.length) {
      return expirationDates;
    }
    try {
      const resp = await this.authorizationService.listAuthorizations({
        pagination: { limit: ids.length },
        filters: [{ filter: { case: 'authorizationIds', value: { ids } } }],
      });
      for (const authorization of resp.authorizations) {
        if (authorization.expirationDate) {
          expirationDates.set(authorization.id, timestampDate(authorization.expirationDate));
        }
      }
    } catch (error) {
      // the end dates are informational, the role assignments are still shown without them
      console.error(error);
    }
    return expirationDates;
  }

  /**
   * Connect this data source to the table. The table will only update when
   * the returned stream emits new lists of items.
   * @returns A stream of item lists to be rendered.
   */
  public connect(): Observable<Array<UserGrantAsObject>> {
    return this.grantsSubject.asObservable();
  }

  /**
   *  Called when the table is being destroyed. Use this function, to clean up
   * any open connections or free any held resources that were set up during connect.
   */
  public disconnect(): void {
    this.grantsSubject.complete();
    this.loadingSubject.complete();
  }
}
