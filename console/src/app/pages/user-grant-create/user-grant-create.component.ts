import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Location } from '@angular/common';
import { Component, effect, OnDestroy } from '@angular/core';
import { AbstractControl, FormControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Params } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ProjectType } from 'src/app/modules/project-members/project-members-datasource';
import { UserTarget } from 'src/app/modules/search-user-autocomplete/search-user-autocomplete.component';
import { UserGrantContext } from 'src/app/modules/user-grants/user-grants-datasource';
import { GrantedProject, Project } from 'src/app/proto/generated/zitadel/project_pb';
import { User } from 'src/app/proto/generated/zitadel/user_pb';
import { AuthorizationService } from 'src/app/services/authorization.service';
import { Breadcrumb, BreadcrumbService, BreadcrumbType } from 'src/app/services/breadcrumb.service';
import { ManagementService } from 'src/app/services/mgmt.service';
import { ToastService } from 'src/app/services/toast.service';
import { NewOrganizationService } from '../../services/new-organization.service';

@Component({
  selector: 'cnsl-user-grant-create',
  templateUrl: './user-grant-create.component.html',
  styleUrls: ['./user-grant-create.component.scss'],
  standalone: false,
})
export class UserGrantCreateComponent implements OnDestroy {
  public context!: UserGrantContext;

  public activateOrganizationQuery = this.newOrganizationService.activeOrganizationQuery();
  public userIds: string[] = [];

  public project?: Project.AsObject;
  public grantedProject?: GrantedProject.AsObject;

  public rolesList: string[] = [];

  // Optional end date of the role assignment as local date and time (value of a datetime-local input).
  // If empty, the role assignment does not expire.
  public expirationControl = new FormControl<string>('', { nonNullable: true, validators: [futureDateValidator] });
  public minExpiration: string = toDateTimeLocal(new Date());

  public createSteps: number = 2;
  public currentCreateStep: number = 1;

  public UserGrantContext: any = UserGrantContext;

  public user?: User.AsObject;
  public UserTarget: any = UserTarget;

  private destroy$: Subject<void> = new Subject();

  constructor(
    private readonly userService: ManagementService,
    private readonly toast: ToastService,
    private readonly _location: Location,
    private readonly route: ActivatedRoute,
    private readonly mgmtService: ManagementService,
    private readonly newOrganizationService: NewOrganizationService,
    private readonly authorizationService: AuthorizationService,
    breadcrumbService: BreadcrumbService,
  ) {
    breadcrumbService.setBreadcrumb([
      new Breadcrumb({
        type: BreadcrumbType.ORG,
        routerLink: ['/org'],
      }),
    ]);
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params: Params) => {
      const { projectid, grantid, userid } = params;
      this.context = UserGrantContext.NONE;

      this.userIds = userid ? [userid] : [];

      if (projectid && !grantid) {
        this.context = UserGrantContext.OWNED_PROJECT;

        this.mgmtService
          .getProjectByID(projectid)
          .then((resp) => {
            if (resp.project) {
              this.project = resp.project;
            }
          })
          .catch((error: any) => {
            this.toast.showError(error);
          });
      } else if (projectid && grantid) {
        this.context = UserGrantContext.GRANTED_PROJECT;
        this.mgmtService
          .getGrantedProjectByID(projectid, grantid)
          .then((resp) => {
            if (resp.grantedProject) {
              this.grantedProject = resp.grantedProject;
            }
          })
          .catch((error: any) => {
            this.toast.showError(error);
          });
      } else if (this.userIds && this.userIds.length === 1) {
        this.context = UserGrantContext.USER;
        this.mgmtService
          .getUserByID(this.userIds[0])
          .then((resp) => {
            if (resp.user) {
              this.user = resp.user;
            }
          })
          .catch((error: any) => {
            this.toast.showError(error);
          });
      }
    });

    effect(() => {
      if (this.activateOrganizationQuery.isError()) {
        this.toast.showError(this.activateOrganizationQuery.error());
      }
    });
  }

  public close(): void {
    this._location.back();
  }

  public addGrant(): void {
    switch (this.context) {
      case UserGrantContext.OWNED_PROJECT:
        const prom = this.userIds.map((id) => this.createGrant(id, this.rolesList, this.project?.id));
        Promise.all(prom)
          .then(() => {
            this.toast.showInfo('GRANTS.TOAST.UPDATED', true);
            this.close();
          })
          .catch((error: any) => {
            this.toast.showError(error);
            this.close();
          });
        break;
      case UserGrantContext.GRANTED_PROJECT:
        const promp = this.userIds.map((id) =>
          this.createGrant(id, this.rolesList, this.grantedProject?.projectId, this.grantedProject?.grantId),
        );
        Promise.all(promp)
          .then(() => {
            this.toast.showInfo('GRANTS.TOAST.UPDATED', true);
            this.close();
          })
          .catch((error: any) => {
            this.toast.showError(error);
            this.close();
          });
        break;
      case UserGrantContext.USER:
        let grantId: string = '';
        let grantedProjectId: string = '';

        if (this.grantedProject?.grantId) {
          grantId = this.grantedProject.grantId;
          grantedProjectId = this.grantedProject.projectId;
        }

        const promu = this.userIds.map((id) =>
          this.createGrant(
            id,
            this.rolesList,
            this.project?.id ? this.project.id : grantedProjectId ? grantedProjectId : '',
            grantId,
          ),
        );
        Promise.all(promu)
          .then(() => {
            this.toast.showInfo('GRANTS.TOAST.UPDATED', true);
            this.close();
          })
          .catch((error: any) => {
            this.toast.showError(error);
            this.close();
          });
        break;
      case UserGrantContext.NONE:
        let tempGrantId: string = '';

        if (this.grantedProject?.grantId) {
          tempGrantId = this.grantedProject.grantId;
        }

        const promn = this.userIds.map((id) =>
          this.createGrant(
            id,
            this.rolesList,
            this.project ? this.project.id : this.grantedProject ? this.grantedProject.projectId : '',
            tempGrantId,
          ),
        );
        Promise.all(promn)
          .then(() => {
            this.toast.showInfo('GRANTS.TOAST.UPDATED', true);
            this.close();
          })
          .catch((error: any) => {
            this.toast.showError(error);
            this.close();
          });
        break;
    }
  }

  public get expirationDate(): Date | undefined {
    const value = this.expirationControl.value;
    return value ? new Date(value) : undefined;
  }

  public get expirationInPast(): boolean {
    // evaluated on every check, as a chosen date can pass while the page is open
    return isInPast(this.expirationControl.value);
  }

  // Role assignments with an end date are created through the v2 API, which supports time-bound role assignments.
  // The expiration is set in the same request, so the role assignment never exists without it.
  private createGrant(userId: string, roleKeys: string[], projectId?: string, projectGrantId?: string): Promise<unknown> {
    const expirationDate = this.expirationDate;
    if (!expirationDate) {
      return this.userService.addUserGrant(userId, roleKeys, projectId, projectGrantId);
    }
    return this.authorizationService.createAuthorization({
      userId,
      projectId: projectId ?? '',
      organizationId: this.activateOrganizationQuery.data()?.id ?? '',
      roleKeys,
      expirationDate: timestampFromDate(expirationDate),
    });
  }

  public selectProject(project: Project.AsObject | GrantedProject.AsObject, type: ProjectType): void {
    if (type === ProjectType.PROJECTTYPE_OWNED) {
      this.project = project as Project.AsObject;
    } else if (type === ProjectType.PROJECTTYPE_GRANTED) {
      this.grantedProject = project as GrantedProject.AsObject;
    }
  }

  public selectUsers(user: User.AsObject[]): void {
    if (user && user.length) {
      this.userIds = (user as User.AsObject[]).map((u) => u.id);
    }
  }

  public selectRoles(roleKeys: string[]): void {
    this.rolesList = roleKeys;
  }

  public next(): void {
    this.currentCreateStep++;
  }

  public previous(): void {
    this.currentCreateStep--;
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

function isInPast(value: string): boolean {
  return !!value && new Date(value).getTime() <= Date.now();
}

function futureDateValidator(control: AbstractControl<string>): ValidationErrors | null {
  return isInPast(control.value) ? { inPast: true } : null;
}

// toDateTimeLocal formats a date as the local date and time expected by a datetime-local input.
function toDateTimeLocal(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
