#!/usr/bin/env perl
# Perl Mojolicious — Deploy to Heroku / Render
# Install: cpanm Mojolicious
# Run:     morbo main.pl  (dev)  /  hypnotoad main.pl  (prod)

use strict;
use warnings;
use Mojolicious::Lite -signatures;
use Mojo::UserAgent;
use Mojo::JSON qw(encode_json decode_json);

my $ua            = Mojo::UserAgent->new;
my $SUPABASE_URL  = $ENV{SUPABASE_URL}  // '';
my $SUPABASE_KEY  = $ENV{SUPABASE_SERVICE_ROLE_KEY} // '';

sub sb_headers { (
    apikey        => $SUPABASE_KEY,
    Authorization => "Bearer $SUPABASE_KEY",
    'Content-Type'=> 'application/json',
) }

sub sb_fetch {
    my (%args) = @_;
    my $path   = $args{path};
    my $method = lc($args{method} // 'get');
    my $body   = $args{body};
    my $prefer = $args{prefer};

    my %headers = (sb_headers());
    $headers{Prefer} = $prefer if $prefer;

    my $url = "$SUPABASE_URL/rest/v1$path";
    my $tx;
    if ($body) {
        $tx = $ua->$method($url => \%headers => encode_json($body));
    } else {
        $tx = $ua->$method($url => \%headers);
    }
    my $res = $tx->result;
    return decode_json($res->body || '[]');
}

hook before_dispatch => sub ($c) {
    $c->res->headers->header('Access-Control-Allow-Origin'  => '*');
    $c->res->headers->header('Access-Control-Allow-Methods' => 'GET, POST, PATCH, DELETE, OPTIONS');
    $c->res->headers->header('Access-Control-Allow-Headers' => 'Content-Type');
};

options '/api/perl/todos'      => sub ($c) { $c->render(text => '', status => 200) };
options '/api/perl/todos/:id'  => sub ($c) { $c->render(text => '', status => 200) };

# GET /todos
get '/api/perl/todos' => sub ($c) {
    my $todos = sb_fetch(path => '/todos?select=*&order=created_at.desc');
    $c->render(json => { todos => $todos });
};

# POST /todos
post '/api/perl/todos' => sub ($c) {
    my $body  = $c->req->json // {};
    my $title = $body->{title} // '';
    $title    =~ s/^\s+|\s+$//g;
    if (!$title) {
        return $c->render(json => { error => 'title is required' }, status => 400);
    }
    my $data = sb_fetch(
        path   => '/todos',
        method => 'POST',
        body   => { title => $title, completed => \0 },
        prefer => 'return=representation',
    );
    $c->render(json => { todo => $data->[0] }, status => 201);
};

# PATCH /todos/:id
patch '/api/perl/todos/:id' => sub ($c) {
    my $id   = $c->param('id');
    my $body = $c->req->json // {};
    my %update;
    $update{title}     = $body->{title}     if exists $body->{title};
    $update{completed} = $body->{completed} if exists $body->{completed};

    my $data = sb_fetch(
        path   => "/todos?id=eq.$id",
        method => 'PATCH',
        body   => \%update,
        prefer => 'return=representation',
    );
    if (!@$data) {
        return $c->render(json => { error => 'todo not found' }, status => 404);
    }
    $c->render(json => { todo => $data->[0] });
};

# DELETE /todos/:id
del '/api/perl/todos/:id' => sub ($c) {
    my $id       = $c->param('id');
    my $existing = sb_fetch(path => "/todos?id=eq.$id&select=id");
    if (!@$existing) {
        return $c->render(json => { error => 'todo not found' }, status => 404);
    }
    sb_fetch(path => "/todos?id=eq.$id", method => 'DELETE');
    $c->render(json => { message => 'deleted' });
};

app->start;
